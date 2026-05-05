// Package ack implements the /ack command: given a user question, find the
// most relevant snippets across the knowledge base and return them along with
// a single overall summary that synthesizes the evidence.
//
// Pipeline:
//  1. Scan all document metadata to collect the existing tag universe.
//  2. Ask the LLM to map the query to a subset of those tags.
//  3. Recall candidate documents locally by tag union + full-text contains
//     hits, ranked and capped to topRecall.
//  4. For each candidate, ask the LLM to extract relevant line ranges.
//  5. Merge all extracted snippets, sort by score, and keep the top results
//     with content sliced from the source files.
//  6. Ask the LLM once more to synthesize an overall summary from the kept
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
	"strings"

	"mindstack/internal/meta"

	einoschema "github.com/cloudwego/eino/schema"
)

const (
	maxContentLength  = 8000
	topRecall         = 10
	topSnippets       = 5
	maxSnippetsPerDoc = 3
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
	// Extract content after the first "---" separator to skip the markdown header.
	s := string(data)
	if idx := strings.Index(s, "\n---\n"); idx >= 0 {
		return strings.TrimSpace(s[idx+5:])
	}
	return strings.TrimSpace(s)
}

// Snippet is a single excerpt returned by Ack.
type Snippet struct {
	Path      string  `json:"path"`
	StartLine int     `json:"startLine"`
	EndLine   int     `json:"endLine"`
	Content   string  `json:"content"`
	Score     float64 `json:"score"`
}

// Result is the response payload of Ack.
type Result struct {
	Query    string    `json:"query"`
	Tags     []string  `json:"tags"`
	Summary  string    `json:"summary"`
	Snippets []Snippet `json:"snippets"`
}

// LLMClient is the subset of llm.Service used by Ack. Defined as an interface
// to allow tests to inject a fake without touching the real LLM stack.
type LLMClient interface {
	Chat(ctx context.Context, messages []*einoschema.Message) (string, error)
}

// Ack runs the full /ack pipeline: tag extraction -> recall -> snippet
// extraction -> top-k selection. kbRoot must be an absolute path to a synced
// knowledge base root.
func Ack(ctx context.Context, llmSvc LLMClient, kbRoot, query, lang string) (*Result, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("empty query")
	}

	metas, err := meta.ScanAll(kbRoot, "")
	if err != nil {
		return nil, fmt.Errorf("scan meta: %w", err)
	}

	allTags := collectAllTags(metas)
	pickedTags, err := extractTagsFromQuery(ctx, llmSvc, query, allTags, lang)
	if err != nil {
		// Tag extraction failure is non-fatal: fall back to full-text only.
		pickedTags = nil
	}

	candidates := recallCandidates(metas, kbRoot, pickedTags, query)
	if len(candidates) == 0 {
		return &Result{Query: query, Tags: pickedTags, Snippets: []Snippet{}}, nil
	}

	type docExtraction struct {
		relPath  string
		absPath  string
		snippets []snippetSpec
	}

	var extractions []docExtraction
	for _, c := range candidates {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		absPath := filepath.Join(kbRoot, c.relPath)
		raw, err := os.ReadFile(absPath)
		if err != nil {
			continue
		}
		snippets, err := extractDocSnippets(ctx, llmSvc, query, c.relPath, string(raw), lang)
		if err != nil {
			continue
		}
		if len(snippets) == 0 {
			continue
		}
		extractions = append(extractions, docExtraction{
			relPath:  c.relPath,
			absPath:  absPath,
			snippets: snippets,
		})
	}

	var all []Snippet
	for _, ex := range extractions {
		raw, err := os.ReadFile(ex.absPath)
		if err != nil {
			continue
		}
		lines := splitLines(string(raw))
		for _, sp := range ex.snippets {
			start, end, ok := clampRange(sp.Start, sp.End, len(lines))
			if !ok {
				continue
			}
			all = append(all, Snippet{
				Path:      ex.absPath,
				StartLine: start,
				EndLine:   end,
				Content:   joinLines(lines, start, end),
				Score:     sp.Score,
			})
		}
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
		Summary:  summary,
		Snippets: all,
	}, nil
}

// collectAllTags returns the sorted, de-duplicated tag union across metas.
func collectAllTags(metas []*meta.DocumentMeta) []string {
	set := make(map[string]struct{})
	for _, m := range metas {
		for _, t := range m.Tags {
			t = strings.TrimSpace(t)
			if t == "" {
				continue
			}
			set[t] = struct{}{}
		}
	}
	out := make([]string, 0, len(set))
	for t := range set {
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}

// candidate is a recalled document with a local relevance score.
type candidate struct {
	relPath      string
	tagHits      int
	fulltextHits int
	score        int
}

// recallCandidates merges tag-based and full-text recall over the meta set.
// Tag matching uses OR semantics across pickedTags. Documents are ranked by
// `2*tagHits + fulltextHits` and capped to topRecall.
func recallCandidates(metas []*meta.DocumentMeta, kbRoot string, pickedTags []string, query string) []candidate {
	tagSet := make(map[string]struct{}, len(pickedTags))
	for _, t := range pickedTags {
		tagSet[strings.ToLower(strings.TrimSpace(t))] = struct{}{}
	}

	queryLower := strings.ToLower(query)

	scored := make(map[string]*candidate, len(metas))

	for _, m := range metas {
		c, ok := scored[m.Path]
		if !ok {
			c = &candidate{relPath: m.Path}
			scored[m.Path] = c
		}
		if len(tagSet) > 0 {
			for _, t := range m.Tags {
				if _, hit := tagSet[strings.ToLower(t)]; hit {
					c.tagHits++
				}
			}
		}
	}

	if queryLower != "" {
		for _, m := range metas {
			absPath := filepath.Join(kbRoot, m.Path)
			data, err := os.ReadFile(absPath)
			if err != nil {
				continue
			}
			hits := strings.Count(strings.ToLower(string(data)), queryLower)
			if hits == 0 {
				continue
			}
			c, ok := scored[m.Path]
			if !ok {
				c = &candidate{relPath: m.Path}
				scored[m.Path] = c
			}
			c.fulltextHits = hits
		}
	}

	var list []candidate
	for _, c := range scored {
		c.score = 2*c.tagHits + c.fulltextHits
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

// snippetSpec is what the LLM returns for each picked range.
type snippetSpec struct {
	Start int     `json:"start"`
	End   int     `json:"end"`
	Score float64 `json:"score"`
}

func extractTagsFromQuery(ctx context.Context, svc LLMClient, query string, allTags []string, lang string) ([]string, error) {
	if len(allTags) == 0 {
		return nil, nil
	}
	var sb strings.Builder
	for _, t := range allTags {
		sb.WriteString("- ")
		sb.WriteString(t)
		sb.WriteByte('\n')
	}
	prompt := fmt.Sprintf(loadPrompt("tag", lang), query, sb.String())

	resp, err := svc.Chat(ctx, []*einoschema.Message{{Role: einoschema.User, Content: prompt}})
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

func extractDocSnippets(ctx context.Context, svc LLMClient, query, relPath, content, lang string) ([]snippetSpec, error) {
	numbered, _ := numberLines(content, maxContentLength)
	prompt := fmt.Sprintf(loadPrompt("snippet", lang), query, relPath, numbered, maxSnippetsPerDoc)

	resp, err := svc.Chat(ctx, []*einoschema.Message{{Role: einoschema.User, Content: prompt}})
	if err != nil {
		return nil, err
	}

	cleaned := stripJSONFences(resp)
	var parsed struct {
		Snippets []snippetSpec `json:"snippets"`
	}
	if err := json.Unmarshal([]byte(cleaned), &parsed); err != nil {
		return nil, fmt.Errorf("parse snippet response: %w (raw: %s)", err, resp)
	}
	return parsed.Snippets, nil
}

func summarizeSnippets(ctx context.Context, svc LLMClient, query string, snippets []Snippet, lang string) (string, error) {
	var sb strings.Builder
	for i, s := range snippets {
		fmt.Fprintf(&sb, "[%d] %s:%d-%d\n%s\n\n", i+1, s.Path, s.StartLine, s.EndLine, s.Content)
	}
	prompt := fmt.Sprintf(loadPrompt("summary", lang), query, sb.String())

	resp, err := svc.Chat(ctx, []*einoschema.Message{{Role: einoschema.User, Content: prompt}})
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(stripJSONFences(resp)), nil
}

// numberLines returns content with `N: ` prefixed to each line. Truncates to
// maxLen runes (after numbering would expand the size further; we trim raw
// content first, then number). The boolean reports whether truncation was
// applied.
func numberLines(content string, maxLen int) (string, bool) {
	runes := []rune(content)
	truncated := false
	if maxLen > 0 && len(runes) > maxLen {
		content = string(runes[:maxLen])
		truncated = true
	}
	lines := splitLines(content)
	var sb strings.Builder
	for i, ln := range lines {
		fmt.Fprintf(&sb, "%d: %s\n", i+1, ln)
	}
	if truncated {
		sb.WriteString("... [truncated]\n")
	}
	return sb.String(), truncated
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
