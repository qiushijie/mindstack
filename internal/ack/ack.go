// Package ack implements the /ack command: given a user question, find the
// most relevant snippets across the knowledge base and return them along with
// a single overall summary that synthesizes the evidence.
//
// Pipeline:
//  1. Scan all document metadata.
//  2. Ask the LLM to map the query to existing tags AND extract search keywords.
//  3. Recall candidate documents locally by tag union + title/summary/full-text
//     hits using LLM-extracted keywords, ranked and capped to topRecall.
//  4. Ask the LLM once to rerank the candidates and return relevance scores.
//  5. For each top-ranked document, extract relevant snippets via LLM with local
//     keyword-matching fallback.
//  6. Merge all extracted snippets, sort by score, and keep the top results.
//  7. Ask the LLM once more to synthesize an overall summary from the kept
//     snippets and the original query.
package ack

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"mindstack/internal/meta"
	"mindstack/internal/retrieval"

	"github.com/cloudwego/eino/schema"
	"golang.org/x/sync/errgroup"
)

const (
	topRecall         = 15
	topSnippets       = 5
	maxSnippetsPerDoc = 3
	previewMaxLines   = 50
	contextLines      = 2
)

//go:embed prompts/*/*.md
var promptsFS embed.FS

// loadPrompt reads a prompt template from the embedded prompts directory.
// name is the file basename without extension (e.g. "tag").
// lang should be a language code such as "zh" or "en"; non-zh falls back to "en".
func loadPrompt(name, lang string) string {
	if lang != "zh" {
		lang = "en"
	}
	data, err := promptsFS.ReadFile("prompts/" + lang + "/" + name + ".md")
	if err != nil {
		return ""
	}
	s := string(data)
	if idx := strings.Index(s, "\n---\n"); idx >= 0 {
		return strings.TrimSpace(s[idx+5:])
	}
	return strings.TrimSpace(s)
}

// Snippet is a single excerpt returned by Ack.
type Snippet struct {
	Location string  `json:"location"`
	Content  string  `json:"content"`
	Score    float64 `json:"score"`
}

// snippetLocation builds a location string in the form "path#startLine-endLine".
func snippetLocation(path string, start, end int) string {
	return fmt.Sprintf("%s#%d-%d", path, start, end)
}

// parseLocationLines parses a location string in the form "#startLine-endLine"
// and returns the line numbers. Returns (0, 0) on failure.
func parseLocationLines(loc string) (start, end int) {
	loc = strings.TrimPrefix(loc, "#")
	parts := strings.SplitN(loc, "-", 2)
	if len(parts) != 2 {
		return 0, 0
	}
	s, err1 := strconv.Atoi(parts[0])
	e, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil {
		return 0, 0
	}
	return s, e
}

// Result is the response payload of Ack.
type Result struct {
	Query    string    `json:"query"`
	Tags     []string  `json:"tags"`
	Keywords []string  `json:"keywords"`
	Summary  string    `json:"summary"`
	Snippets []Snippet `json:"snippets"`
}

// LLMClient is the subset of llm.Service used by Ack. Defined as an interface
// to allow tests to inject a fake without touching the real LLM stack.
type LLMClient interface {
	Chat(ctx context.Context, messages []*schema.Message) (string, error)
}

// Ack runs the full /ack pipeline: tag extraction -> recall -> rerank ->
// local snippet extraction -> summary. kbRoot must be an absolute path to a
// synced knowledge base root.
func Ack(ctx context.Context, llmSvc LLMClient, kbRoot, query, lang string) (*Result, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("empty query")
	}

	metas, err := meta.ScanAll(kbRoot, "")
	if err != nil {
		return nil, fmt.Errorf("scan meta: %w", err)
	}

	allTags, counts := selectTagCandidates(metas, query)
	tagList := formatTagsWithCounts(allTags, counts)

	// Concurrent tag + keyword extraction via errgroup.
	g, gctx := errgroup.WithContext(ctx)

	var pickedTags []string
	var keywords []string

	g.Go(func() error {
		tags, err := extractTagsFromQuery(gctx, llmSvc, query, tagList, allTags, lang)
		if err != nil {
			return nil // non-fatal: tags stay nil
		}
		pickedTags = tags
		return nil
	})

	g.Go(func() error {
		kws, err := extractKeywordsFromQuery(gctx, llmSvc, query, lang)
		if err != nil || len(kws) == 0 {
			return nil // non-fatal: keywords stay nil, will fallback below
		}
		keywords = kws
		return nil
	})

	_ = g.Wait()

	if keywords == nil {
		keywords = []string{strings.ToLower(query)}
	}

	cache := newContentCache()
	candidates := recallCandidates(metas, cache, kbRoot, pickedTags, keywords)
	if len(candidates) == 0 {
		return &Result{Query: query, Tags: pickedTags, Keywords: keywords, Snippets: []Snippet{}}, nil
	}

	// Build document previews for rerank.
	previews := make([]string, 0, len(candidates))
	metaByPath := make(map[string]*meta.DocumentMeta, len(metas))
	for _, m := range metas {
		metaByPath[m.Path] = m
	}
	for _, c := range candidates {
		m := metaByPath[c.relPath]
		if m == nil {
			continue
		}
		preview, err := makeDocPreview(kbRoot, c.relPath, m, lang, cache, c.matches)
		if err != nil {
			continue
		}
		previews = append(previews, preview)
	}

	// Single LLM call to rerank all candidates.
	ranked := rerankCandidates(ctx, llmSvc, query, previews, lang, topSnippets)
	if len(ranked) == 0 {
		return &Result{Query: query, Tags: pickedTags, Keywords: keywords, Snippets: []Snippet{}}, nil
	}

	// Build the candidate relPath set so we can reject any path the LLM returns
	// that is not exactly one of the recall candidates (directory traversal guard).
	candidateSet := make(map[string]struct{}, len(candidates))
	for _, c := range candidates {
		candidateSet[c.relPath] = struct{}{}
	}

	// Snippet extraction from top-ranked documents using LLM with local fallback.
	type docContent struct {
		path     string
		filtered *retrieval.FilteredContent
		score    float64
	}
	var docs []docContent
	for _, r := range ranked {
		if _, ok := candidateSet[r.Path]; !ok {
			continue
		}
		raw, err := cache.getRaw(kbRoot, r.Path)
		if err != nil {
			continue
		}
		filtered := prefilterContent(raw, keywords, 10)
		docs = append(docs, docContent{path: r.Path, filtered: filtered, score: r.Score})
	}

	// Parallel LLM snippet extraction with per-document fallback.
	eg, ectx := errgroup.WithContext(ctx)
	eg.SetLimit(3)
	snippetCh := make(chan []Snippet, len(docs))
	for _, d := range docs {
		d := d
		eg.Go(func() error {
			select {
			case <-ectx.Done():
				return nil
			default:
			}
			snippets := extractSnippetsLLM(ectx, llmSvc, query, kbRoot, d.path, d.filtered, lang, maxSnippetsPerDoc)
			if snippets == nil {
				snippets = extractSnippetsLocal(keywords, kbRoot, d.path, d.filtered, d.score)
			}
			if len(snippets) > 0 {
				snippetCh <- snippets
			}
			return nil
		})
	}
	_ = eg.Wait()
	close(snippetCh)

	var all []Snippet
	for s := range snippetCh {
		all = append(all, s...)
	}

	sort.SliceStable(all, func(i, j int) bool {
		return all[i].Score > all[j].Score
	})
	if len(all) > topSnippets {
		all = all[:topSnippets]
	}
	if all == nil {
		all = []Snippet{}
	}

	summary := ""
	if len(all) > 0 {
		if s, err := summarizeSnippets(ctx, llmSvc, query, all, lang); err == nil {
			summary = s
		}
	}

	return &Result{
		Query:    query,
		Tags:     pickedTags,
		Keywords: keywords,
		Summary:  summary,
		Snippets: all,
	}, nil
}

// contentCache caches file contents for the duration of a single Ack call to
// avoid re-reading the same file across makeDocPreview and snippet extraction.
type contentCache struct {
	raw map[string]string // absPath -> original content
}

func newContentCache() *contentCache {
	return &contentCache{raw: make(map[string]string)}
}

func (c *contentCache) getRaw(kbRoot, relPath string) (string, error) {
	absPath := filepath.Join(kbRoot, relPath)
	if content, ok := c.raw[absPath]; ok {
		return content, nil
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}
	raw := string(data)
	c.raw[absPath] = raw
	return raw, nil
}

const (
	tagCandidateTopPopular = 100
	tagCandidateQueryHit   = 50
	tagCandidateMax        = 150
)

// selectTagCandidates returns a list of tags to present to the LLM for tag
// extraction. It combines high-frequency tags with low-frequency tags that have
// a direct substring or token match against the query, preventing rare but
// highly relevant tags from being dropped.
func selectTagCandidates(metas []*meta.DocumentMeta, query string) ([]string, map[string]int) {
	counts := make(map[string]int)
	for _, m := range metas {
		seen := make(map[string]bool, len(m.Tags))
		for _, t := range m.Tags {
			t = strings.TrimSpace(t)
			if t != "" && !seen[t] {
				counts[t]++
				seen[t] = true
			}
		}
	}

	if len(counts) <= tagCandidateMax {
		all := make([]string, 0, len(counts))
		for t := range counts {
			all = append(all, t)
		}
		sort.Strings(all)
		return all, counts
	}

	// Build a sorted list of all tags by count desc, name asc.
	type tagCount struct {
		tag   string
		count int
	}
	var all []tagCount
	for t, c := range counts {
		all = append(all, tagCount{t, c})
	}
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].count != all[j].count {
			return all[i].count > all[j].count
		}
		return all[i].tag < all[j].tag
	})

	selected := make(map[string]struct{})
	var result []string

	// 1. Top popular tags.
	popularLimit := tagCandidateTopPopular
	if popularLimit > len(all) {
		popularLimit = len(all)
	}
	for i := 0; i < popularLimit; i++ {
		t := all[i].tag
		if _, ok := selected[t]; !ok {
			selected[t] = struct{}{}
			result = append(result, t)
		}
	}

	// 2. Low-frequency tags that directly match the query.
	queryLower := retrieval.ToLowerAlphanumeric(query)
	queryTokens := strings.Fields(queryLower)
	for _, tc := range all {
		if len(selected) >= tagCandidateMax {
			break
		}
		t := tc.tag
		if _, ok := selected[t]; ok {
			continue
		}
		tagLower := retrieval.ToLowerAlphanumeric(t)
		if tagLower == "" {
			continue
		}
		if strings.Contains(queryLower, tagLower) {
			selected[t] = struct{}{}
			result = append(result, t)
			continue
		}
		for _, token := range queryTokens {
			if token != "" && strings.Contains(tagLower, token) {
				selected[t] = struct{}{}
				result = append(result, t)
				break
			}
		}
	}

	return result, counts
}

// formatTagsWithCounts formats tags with their document counts for the LLM prompt.
func formatTagsWithCounts(tags []string, counts map[string]int) string {
	var sb strings.Builder
	for _, t := range tags {
		sb.WriteString("- ")
		sb.WriteString(t)
		if c, ok := counts[t]; ok {
			fmt.Fprintf(&sb, " (%d docs)", c)
		}
		sb.WriteByte('\n')
	}
	return sb.String()
}

// prefilterContent returns only the lines of content that are within contextWindow
// lines of any keyword match. If the filtered result would retain >80% of lines,
// the original content is returned unchanged.
func prefilterContent(content string, keywords []string, contextWindow int) *retrieval.FilteredContent {
	lines := splitLines(content)
	if len(lines) == 0 {
		return &retrieval.FilteredContent{}
	}

	keywordLower := make([]string, 0, len(keywords))
	for _, k := range keywords {
		keywordLower = append(keywordLower, strings.ToLower(k))
	}

	hit := make([]bool, len(lines))
	for i, line := range lines {
		lineLower := strings.ToLower(line)
		for _, kw := range keywordLower {
			if strings.Contains(lineLower, kw) {
				for j := max(0, i-contextWindow); j <= min(len(lines)-1, i+contextWindow); j++ {
					hit[j] = true
				}
				break
			}
		}
	}

	hitCount := 0
	for _, h := range hit {
		if h {
			hitCount++
		}
	}

	// Return the full content with original line numbers when filtering is not needed.
	if len(lines) <= 100 || hitCount > len(lines)*80/100 {
		fc := &retrieval.FilteredContent{Lines: make([]retrieval.NumberedLine, len(lines))}
		for i, line := range lines {
			fc.Lines[i] = retrieval.NumberedLine{OriginalLine: i + 1, Text: line}
		}
		return fc
	}

	var filtered []retrieval.NumberedLine
	for i, line := range lines {
		if hit[i] {
			filtered = append(filtered, retrieval.NumberedLine{OriginalLine: i + 1, Text: line})
		}
	}
	return &retrieval.FilteredContent{Lines: filtered}
}

// candidate is a recalled document with a local relevance score.
type candidate struct {
	relPath      string
	tagHits      int
	titleHits    int
	summaryHits  int
	headingsHits int
	fulltextHits int
	score        int
	matches      []retrieval.LineMatch
}

// recallCandidates delegates local recall to the unified retrieval engine.
// It keeps the candidate type so downstream preview and rerank code does not
// need to change in this stage.
func recallCandidates(metas []*meta.DocumentMeta, cache *contentCache, kbRoot string, pickedTags, keywords []string) []candidate {
	q := retrieval.Query{Raw: strings.Join(append(pickedTags, keywords...), " ")}
	if len(pickedTags) > 0 {
		q.Tags = pickedTags
	}
	if len(keywords) > 0 {
		q.Terms = keywords
	} else if len(pickedTags) > 0 {
		q.Terms = pickedTags
	}

	rs, err := retrieval.Search(kbRoot, q, retrieval.Options{
		Mode:    retrieval.ModeHybrid,
		TagMode: retrieval.TagModeOR,
		Limit:   topRecall,
	})
	if err != nil {
		return nil
	}

	var list []candidate
	for _, r := range rs.Results {
		relPath := r.RelPath
		if relPath == "" {
			relPath, _ = filepath.Rel(kbRoot, r.Path)
		}
		list = append(list, candidate{
			relPath:      relPath,
			tagHits:      r.Breakdown.TagHits,
			titleHits:    r.Breakdown.TitleHits,
			summaryHits:  r.Breakdown.SummaryHits,
			headingsHits: r.Breakdown.HeadingHits,
			fulltextHits: r.Breakdown.ContentHits,
			score:        r.Score,
			matches:      r.Matches,
		})
	}
	return list
}

// rerankItem is a single result from the LLM rerank step.
type rerankItem struct {
	Path  string  `json:"path"`
	Score float64 `json:"score"`
}

// rerankCandidates asks the LLM to select the most relevant documents from
// the previews in a single call.
func rerankCandidates(ctx context.Context, svc LLMClient, query string, previews []string, lang string, topK int) []rerankItem {
	if len(previews) == 0 {
		return nil
	}
	var sb strings.Builder
	for i, p := range previews {
		fmt.Fprintf(&sb, "[%d]\n%s\n\n", i+1, p)
	}
	prompt := fmt.Sprintf(loadPrompt("rerank", lang), query, sb.String(), topK)

	resp, err := svc.Chat(ctx, []*schema.Message{{Role: schema.User, Content: prompt}})
	if err != nil {
		return nil
	}

	cleaned := stripJSONFences(resp)
	var items []rerankItem
	if err := json.Unmarshal([]byte(cleaned), &items); err != nil {
		return nil
	}
	return items
}

// makeDocPreview builds a preview string for a single document to feed into
// the rerank prompt. It prioritizes matched excerpts from the retrieval engine,
// then falls back to the first previewMaxLines lines of the document body.
func makeDocPreview(kbRoot, relPath string, m *meta.DocumentMeta, lang string, cache *contentCache, matches []retrieval.LineMatch) (string, error) {
	data, err := cache.getRaw(kbRoot, relPath)
	if err != nil {
		return "", err
	}

	lines := splitLines(data)
	var sb strings.Builder
	if lang == "zh" {
		fmt.Fprintf(&sb, "路径: %s\n", relPath)
		fmt.Fprintf(&sb, "标题: %s\n", m.Title)
		if len(m.Tags) > 0 {
			fmt.Fprintf(&sb, "标签: %s\n", strings.Join(m.Tags, ", "))
		}
		if m.Summary != "" {
			fmt.Fprintf(&sb, "摘要: %s\n", m.Summary)
		}
		writeHeadings(&sb, m, lang)
		writeMatchedExcerpts(&sb, lines, matches, lang)
		fmt.Fprintf(&sb, "正文前 %d 行:\n", previewMaxLines)
	} else {
		fmt.Fprintf(&sb, "Path: %s\n", relPath)
		fmt.Fprintf(&sb, "Title: %s\n", m.Title)
		if len(m.Tags) > 0 {
			fmt.Fprintf(&sb, "Tags: %s\n", strings.Join(m.Tags, ", "))
		}
		if m.Summary != "" {
			fmt.Fprintf(&sb, "Summary: %s\n", m.Summary)
		}
		writeHeadings(&sb, m, lang)
		writeMatchedExcerpts(&sb, lines, matches, lang)
		fmt.Fprintf(&sb, "First %d lines:\n", previewMaxLines)
	}
	limit := previewMaxLines
	if len(lines) < limit {
		limit = len(lines)
	}
	for i := 0; i < limit; i++ {
		fmt.Fprintf(&sb, "%d: %s\n", i+1, lines[i])
	}
	if len(lines) > previewMaxLines {
		sb.WriteString("... [truncated]\n")
	}
	return sb.String(), nil
}

func writeHeadings(sb *strings.Builder, m *meta.DocumentMeta, lang string) {
	if len(m.Headings) == 0 {
		return
	}
	if lang == "zh" {
		sb.WriteString("标题层级:\n")
	} else {
		sb.WriteString("Headings:\n")
	}
	for _, h := range m.Headings {
		fmt.Fprintf(sb, "- %s\n", h.Text)
	}
}

func writeMatchedExcerpts(sb *strings.Builder, lines []string, matches []retrieval.LineMatch, lang string) {
	var excerpts []retrieval.NumberedLine
	seen := make(map[int]struct{})
	for _, m := range matches {
		if m.Source != retrieval.SourceContent || m.Line <= 0 || m.Line > len(lines) {
			continue
		}
		if _, ok := seen[m.Line]; ok {
			continue
		}
		seen[m.Line] = struct{}{}
		excerpts = append(excerpts, retrieval.NumberedLine{OriginalLine: m.Line, Text: lines[m.Line-1]})
		if len(excerpts) >= 10 {
			break
		}
	}
	if len(excerpts) == 0 {
		return
	}
	if lang == "zh" {
		sb.WriteString("命中片段:\n")
	} else {
		sb.WriteString("Matched excerpts:\n")
	}
	for _, e := range excerpts {
		fmt.Fprintf(sb, "%d: %s\n", e.OriginalLine, e.Text)
	}
}

// extractSnippetsLocal extracts relevant snippets from a document by local
// keyword matching without any LLM calls. It uses the original line numbers
// preserved by the filtered content. The returned location uses the absolute
// path so the UI can open the file directly.
func extractSnippetsLocal(keywords []string, kbRoot, relPath string, fc *retrieval.FilteredContent, docScore float64) []Snippet {
	if fc == nil || len(fc.Lines) == 0 || len(keywords) == 0 {
		return nil
	}

	keywordLower := make([]string, 0, len(keywords))
	for _, k := range keywords {
		keywordLower = append(keywordLower, strings.ToLower(k))
	}

	// Find all lines containing any keyword, recording their original line numbers.
	var hitLines []int
	for _, line := range fc.Lines {
		lineLower := strings.ToLower(line.Text)
		for _, kw := range keywordLower {
			if strings.Contains(lineLower, kw) {
				hitLines = append(hitLines, line.OriginalLine)
				break
			}
		}
	}
	if len(hitLines) == 0 {
		return nil
	}

	// Merge adjacent hits (gap <= contextLines) into contiguous ranges.
	type lineRange struct{ start, end int }
	var ranges []lineRange
	start := hitLines[0]
	end := hitLines[0]
	for i := 1; i < len(hitLines); i++ {
		if hitLines[i]-end <= contextLines+1 {
			end = hitLines[i]
		} else {
			ranges = append(ranges, lineRange{start, end})
			start = hitLines[i]
			end = hitLines[i]
		}
	}
	ranges = append(ranges, lineRange{start, end})

	// Expand context and build snippets. Because the filtered content may skip
	// lines, we cannot join them on a contiguous slice. Instead, collect all
	// filtered lines that fall within the expanded range.
	var snippets []Snippet
	for _, r := range ranges {
		s := max(1, r.start-contextLines)
		e := r.end + contextLines
		var lines []string
		var actualStart, actualEnd int
		first := true
		for _, nl := range fc.Lines {
			if nl.OriginalLine < s || nl.OriginalLine > e {
				continue
			}
			lines = append(lines, nl.Text)
			if first {
				actualStart = nl.OriginalLine
				first = false
			}
			actualEnd = nl.OriginalLine
		}
		if len(lines) == 0 {
			continue
		}
		absPath := filepath.Join(kbRoot, relPath)
		snippets = append(snippets, Snippet{
			Location: snippetLocation(absPath, actualStart, actualEnd),
			Content:  strings.Join(lines, "\n"),
			Score:    docScore,
		})
	}

	// Cap per-document snippets by content length (longer = more informative).
	if len(snippets) > maxSnippetsPerDoc {
		sort.SliceStable(snippets, func(i, j int) bool {
			return len(snippets[i].Content) > len(snippets[j].Content)
		})
		snippets = snippets[:maxSnippetsPerDoc]
	}

	return snippets
}

// extractSnippetItem is a single result from the LLM snippet extraction step.
type extractSnippetItem struct {
	Location string  `json:"location"`
	Score    float64 `json:"score"`
}

// extractSnippetsLLM asks the LLM to extract the most relevant snippets from a
// single document. The filtered content preserves original markdown line numbers;
// the prompt shows those line numbers and the LLM must return locations using them.
// The returned location uses the absolute path so the UI can open the file directly.
// Returns nil on any error (caller should fallback to local).
func extractSnippetsLLM(ctx context.Context, svc LLMClient, query, kbRoot, relPath string, fc *retrieval.FilteredContent, lang string, maxPerDoc int) []Snippet {
	if fc == nil || len(fc.Lines) == 0 {
		return nil
	}

	var sb strings.Builder
	for _, line := range fc.Lines {
		fmt.Fprintf(&sb, "%d: %s\n", line.OriginalLine, line.Text)
	}

	prompt := fmt.Sprintf(loadPrompt("extract", lang), query, sb.String(), maxPerDoc)

	resp, err := svc.Chat(ctx, []*schema.Message{{Role: schema.User, Content: prompt}})
	if err != nil {
		return nil
	}

	cleaned := stripJSONFences(resp)
	var items []extractSnippetItem
	if err := json.Unmarshal([]byte(cleaned), &items); err != nil {
		return nil
	}

	var snippets []Snippet
	for _, item := range items {
		start, end := parseLocationLines(item.Location)
		if start == 0 {
			continue
		}
		if end == 0 {
			end = start
		}
		// Collect filtered lines that fall within the returned original range.
		var lines []string
		var actualStart, actualEnd int
		first := true
		for _, nl := range fc.Lines {
			if nl.OriginalLine < start || nl.OriginalLine > end {
				continue
			}
			lines = append(lines, nl.Text)
			if first {
				actualStart = nl.OriginalLine
				first = false
			}
			actualEnd = nl.OriginalLine
		}
		if len(lines) == 0 {
			continue
		}
		absPath := filepath.Join(kbRoot, relPath)
		snippets = append(snippets, Snippet{
			Location: snippetLocation(absPath, actualStart, actualEnd),
			Content:  strings.Join(lines, "\n"),
			Score:    item.Score,
		})
	}
	return snippets
}

func extractTagsFromQuery(ctx context.Context, svc LLMClient, query string, tagList string, allTags []string, lang string) ([]string, error) {
	if len(allTags) == 0 {
		return nil, nil
	}
	prompt := fmt.Sprintf(loadPrompt("tag", lang), query, tagList)

	resp, err := svc.Chat(ctx, []*schema.Message{{Role: schema.User, Content: prompt}})
	if err != nil {
		return nil, err
	}

	cleaned := stripJSONFences(resp)
	var picked []string
	if err := json.Unmarshal([]byte(cleaned), &picked); err != nil {
		return nil, fmt.Errorf("parse tag response: %w (raw: %s)", err, resp)
	}

	allowed := make(map[string]struct{}, len(allTags))
	for _, t := range allTags {
		allowed[t] = struct{}{}
	}
	out := make([]string, 0, len(picked))
	for _, t := range picked {
		t = strings.TrimSpace(t)
		if _, ok := allowed[t]; ok {
			out = append(out, t)
		}
	}
	return out, nil
}

func extractKeywordsFromQuery(ctx context.Context, svc LLMClient, query, lang string) ([]string, error) {
	prompt := fmt.Sprintf(loadPrompt("keyword", lang), query)

	resp, err := svc.Chat(ctx, []*schema.Message{{Role: schema.User, Content: prompt}})
	if err != nil {
		return nil, err
	}

	cleaned := stripJSONFences(resp)
	var keywords []string
	if err := json.Unmarshal([]byte(cleaned), &keywords); err != nil {
		return nil, fmt.Errorf("parse keyword response: %w (raw: %s)", err, resp)
	}

	out := make([]string, 0, len(keywords))
	for _, k := range keywords {
		k = strings.TrimSpace(k)
		if k != "" {
			out = append(out, k)
		}
	}
	return out, nil
}

func summarizeSnippets(ctx context.Context, svc LLMClient, query string, snippets []Snippet, lang string) (string, error) {
	var sb strings.Builder
	for i, s := range snippets {
		fmt.Fprintf(&sb, "[%d] %s\n%s\n\n", i+1, s.Location, s.Content)
	}
	prompt := fmt.Sprintf(loadPrompt("summary", lang), query, sb.String())

	resp, err := svc.Chat(ctx, []*schema.Message{{Role: schema.User, Content: prompt}})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(stripJSONFences(resp)), nil
}

// splitLines splits s on \n and drops the trailing empty element produced by a
// terminating newline. It preserves blank lines in the middle.
func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, "\n")
	if n := len(parts); n > 0 && parts[n-1] == "" {
		parts = parts[:n-1]
	}
	return parts
}

// stripJSONFences removes ```json / ``` code-fence wrappers some LLMs emit
// even when asked not to. Mirrors sync.stripCodeFences.
func stripJSONFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```json") {
		s = strings.TrimPrefix(s, "```json")
	} else if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
	}
	if strings.HasSuffix(s, "```") {
		s = strings.TrimSuffix(s, "```")
	}
	return strings.TrimSpace(s)
}
