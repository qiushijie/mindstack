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

	"github.com/cloudwego/eino/schema"
	"golang.org/x/sync/errgroup"
)

const (
	fulltextHitCap    = 20
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

	allTags, counts := filterPopularTags(metas, 2)
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
		preview, err := makeDocPreview(kbRoot, c.relPath, m, lang, cache)
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

	// Snippet extraction from top-ranked documents using LLM with local fallback.
	type docContent struct {
		path    string
		content string
		score   float64
	}
	var docs []docContent
	for _, r := range ranked {
		raw, err := cache.getRaw(kbRoot, r.Path)
		if err != nil {
			continue
		}
		filtered := prefilterContent(raw, keywords, 10)
		if filtered == "" {
			filtered = raw
		}
		docs = append(docs, docContent{path: filepath.Join(kbRoot, r.Path), content: filtered, score: r.Score})
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
			snippets := extractSnippetsLLM(ectx, llmSvc, query, d.path, d.content, lang, maxSnippetsPerDoc)
			if snippets == nil {
				snippets = extractSnippetsLocal(keywords, d.path, d.content, d.score)
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
// avoid re-reading the same file across recallCandidates, makeDocPreview,
// and snippet extraction.
type contentCache struct {
	lower map[string]string // absPath -> lowercase content
	raw   map[string]string // absPath -> original content
}

func newContentCache() *contentCache {
	return &contentCache{lower: make(map[string]string), raw: make(map[string]string)}
}

func (c *contentCache) get(kbRoot, relPath string) (string, error) {
	absPath := filepath.Join(kbRoot, relPath)
	if content, ok := c.lower[absPath]; ok {
		return content, nil
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return "", err
	}
	content := strings.ToLower(string(data))
	c.lower[absPath] = content
	c.raw[absPath] = string(data)
	return content, nil
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
	if _, ok := c.lower[absPath]; !ok {
		c.lower[absPath] = strings.ToLower(raw)
	}
	return raw, nil
}

// filterPopularTags returns only tags that appear in at least minDocCount documents,
// along with the full tag-to-doc-count map for formatting.
func filterPopularTags(metas []*meta.DocumentMeta, minDocCount int) ([]string, map[string]int) {
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
	var popular []string
	for t, c := range counts {
		if c >= minDocCount {
			popular = append(popular, t)
		}
	}
	sort.Strings(popular)
	return popular, counts
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
func prefilterContent(content string, keywords []string, contextWindow int) string {
	lines := splitLines(content)
	if len(lines) <= 100 {
		return content
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
	if hitCount > len(lines)*80/100 {
		return content
	}

	var sb strings.Builder
	for i, line := range lines {
		if hit[i] {
			fmt.Fprintf(&sb, "%d: %s\n", i+1, line)
		}
	}
	return sb.String()
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
}

// recallCandidates merges tag-based, title/summary-based and
// full-text recall over the meta set.
// Tag matching uses OR semantics across pickedTags.
// Fulltext/title/summary/headings matching uses LLM-extracted keywords.
// Documents are ranked by a weighted score and capped to topRecall.
func recallCandidates(metas []*meta.DocumentMeta, cache *contentCache, kbRoot string, pickedTags, keywords []string) []candidate {
	tagSet := make(map[string]struct{}, len(pickedTags))
	for _, t := range pickedTags {
		tagSet[strings.ToLower(strings.TrimSpace(t))] = struct{}{}
	}

	keywordLower := make([]string, 0, len(keywords))
	for _, k := range keywords {
		keywordLower = append(keywordLower, strings.ToLower(strings.TrimSpace(k)))
	}

	scored := make(map[string]*candidate, len(metas))

	// First pass: Tags + Title + Summary (no file IO).
	for _, m := range metas {
		c := &candidate{relPath: m.Path}

		if len(tagSet) > 0 {
			for _, t := range m.Tags {
				if _, hit := tagSet[strings.ToLower(t)]; hit {
					c.tagHits++
				}
			}
		}

		titleLower := strings.ToLower(m.Title)
		summaryLower := strings.ToLower(m.Summary)
		for _, term := range keywordLower {
			c.titleHits += strings.Count(titleLower, term)
			c.summaryHits += strings.Count(summaryLower, term)
		}
		for _, h := range m.Headings {
			hLower := strings.ToLower(h.Text)
			for _, term := range keywordLower {
				c.headingsHits += strings.Count(hLower, term)
			}
		}

		scored[m.Path] = c
	}

	// Second pass: full-text (uses content cache).
	for _, m := range metas {
		contentLower, err := cache.get(kbRoot, m.Path)
		if err != nil {
			continue
		}
		var hits int
		for _, term := range keywordLower {
			hits += strings.Count(contentLower, term)
		}
		if hits == 0 {
			continue
		}
		if c, ok := scored[m.Path]; ok {
			c.fulltextHits = hits
		}
	}

	var list []candidate
	for _, c := range scored {
		c.score = 5*c.tagHits + 4*c.titleHits + 3*c.summaryHits + 3*c.headingsHits + min(c.fulltextHits, fulltextHitCap)
		if c.score == 0 {
			continue
		}
		list = append(list, *c)
	}

	sort.SliceStable(list, func(i, j int) bool {
		if list[i].score != list[j].score {
			return list[i].score > list[j].score
		}
		return list[i].relPath < list[j].relPath
	})

	if len(list) > topRecall {
		list = list[:topRecall]
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
// the rerank prompt. Includes title, tags, summary, and the first previewMaxLines
// lines of the document body.
func makeDocPreview(kbRoot, relPath string, m *meta.DocumentMeta, lang string, cache *contentCache) (string, error) {
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
		fmt.Fprintf(&sb, "总行数: %d (预览前 %d 行)\n", len(lines), previewMaxLines)
		sb.WriteString("正文预览:\n")
	} else {
		fmt.Fprintf(&sb, "Path: %s\n", relPath)
		fmt.Fprintf(&sb, "Title: %s\n", m.Title)
		if len(m.Tags) > 0 {
			fmt.Fprintf(&sb, "Tags: %s\n", strings.Join(m.Tags, ", "))
		}

		if m.Summary != "" {
			fmt.Fprintf(&sb, "Summary: %s\n", m.Summary)
		}
		fmt.Fprintf(&sb, "Total lines: %d (showing first %d)\n", len(lines), previewMaxLines)
		sb.WriteString("Preview:\n")
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

// extractSnippetsLocal extracts relevant snippets from a document by local
// keyword matching without any LLM calls.
func extractSnippetsLocal(keywords []string, absPath, content string, docScore float64) []Snippet {
	lines := splitLines(content)
	if len(lines) == 0 || len(keywords) == 0 {
		return nil
	}

	keywordLower := make([]string, 0, len(keywords))
	for _, k := range keywords {
		keywordLower = append(keywordLower, strings.ToLower(k))
	}

	// Find all lines containing any keyword.
	var hitLines []int
	for i, line := range lines {
		lineLower := strings.ToLower(line)
		for _, kw := range keywordLower {
			if strings.Contains(lineLower, kw) {
				hitLines = append(hitLines, i+1) // 1-based
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

	// Expand context and build snippets.
	var snippets []Snippet
	for _, r := range ranges {
		s, e, ok := clampRange(r.start-contextLines, r.end+contextLines, len(lines))
		if !ok {
			continue
		}
		snippets = append(snippets, Snippet{
			Location: snippetLocation(absPath, s, e),
			Content:  joinLines(lines, s, e),
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
// single document. Returns nil on any error (caller should fallback to local).
func extractSnippetsLLM(ctx context.Context, svc LLMClient, query, absPath, content, lang string, maxPerDoc int) []Snippet {
	lines := splitLines(content)
	if len(lines) == 0 {
		return nil
	}

	var sb strings.Builder
	for i, line := range lines {
		fmt.Fprintf(&sb, "%d: %s\n", i+1, line)
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
		s, e, ok := clampRange(start, end, len(lines))
		if !ok {
			continue
		}
		snippets = append(snippets, Snippet{
			Location: snippetLocation(absPath, s, e),
			Content:  joinLines(lines, s, e),
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

func joinLines(lines []string, start, end int) string {
	if start < 1 {
		start = 1
	}
	if end > len(lines) {
		end = len(lines)
	}
	return strings.Join(lines[start-1:end], "\n")
}

// clampRange normalizes a [start,end] line range against the actual line count.
// Returns ok=false if the range cannot be made valid (e.g. file is empty or
// inverted/zero-length range that cannot be saved).
func clampRange(start, end, totalLines int) (int, int, bool) {
	if totalLines <= 0 {
		return 0, 0, false
	}
	if start < 1 {
		start = 1
	}
	if end < start {
		return 0, 0, false
	}
	if start > totalLines {
		return 0, 0, false
	}
	if end > totalLines {
		end = totalLines
	}
	return start, end, true
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
