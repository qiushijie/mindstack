package retrieval

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mindstack/internal/meta"
)

const (
	tagWeight     = 5
	titleWeight   = 4
	aliasWeight   = 4
	summaryWeight = 3
	headingWeight = 3
	keywordWeight = 3
	contentCap    = 20
)

// Search runs a retrieval query against the knowledge base.
// The returned Result.Path values are absolute paths.
func Search(kbRoot string, query Query, opts Options) (*ResultSet, error) {
	metas, err := meta.ScanAll(kbRoot, opts.Subdir)
	if err != nil {
		return nil, fmt.Errorf("scan meta: %w", err)
	}

	cache := newContentCache()
	tagVocab := buildTagVocab(metas)

	// If the caller supplied an empty query but the raw string looks like a tag list,
	// re-normalize it. This keeps the CLI tag mode simple.
	if len(query.Tags) == 0 && len(query.Terms) == 0 && strings.Contains(query.Raw, ",") {
		query.Tags = NormalizeTagQuery(query.Raw)
	}

	var results []Result
	for _, m := range metas {
		r, ok := scoreDocument(kbRoot, m, cache, query, opts, tagVocab)
		if !ok {
			continue
		}
		results = append(results, r)
	}

	sortResults(results)

	if opts.Limit > 0 && len(results) > opts.Limit {
		results = results[:opts.Limit]
	}

	return &ResultSet{
		Query:   query.Raw,
		Mode:    opts.Mode,
		Results: results,
		Total:   len(results),
	}, nil
}

func scoreDocument(kbRoot string, m *meta.DocumentMeta, cache *contentCache, query Query, opts Options, tagVocab map[string]struct{}) (Result, bool) {
	var bd MatchBreakdown
	var matches []LineMatch

	mode := opts.Mode
	if mode == "" {
		mode = ModeTag
	}

	includeTags := mode == ModeTag || mode == ModeHybrid
	includeText := mode == ModeFulltext || mode == ModeHybrid

	if includeTags && len(query.Tags) > 0 {
		tagHits, tagMatches := matchTags(m.Tags, query.Tags, opts.TagMode)
		bd.TagHits = tagHits
		for _, lm := range tagMatches {
			lm.Source = SourceTag
			matches = append(matches, lm)
		}
	}

	terms := query.Terms
	if includeText && len(terms) == 0 && len(query.Tags) > 0 {
		// For hybrid mode called from a tag-oriented entry point, fall back
		// to using the tags as full-text terms as well.
		terms = query.Tags
	}

	if includeText && len(terms) > 0 {
		bd.TitleHits, matches = countAndCollect(terms, m.Title, SourceTitle, matches)
		bd.SummaryHits, matches = countAndCollect(terms, m.Summary, SourceSummary, matches)

		for _, h := range m.Headings {
			hits, m2 := countAndCollect(terms, h.Text, SourceHeading, nil)
			bd.HeadingHits += hits
			matches = append(matches, m2...)
		}

		// Keywords and aliases are added in stage 7; keep the breakdown fields
		// ready but do not read them until DocumentMeta is extended.
		bd.KeywordHits, matches = countSliceAndCollect(terms, m.Keywords, SourceKeyword, matches)
		bd.AliasHits, matches = countSliceAndCollect(terms, m.Aliases, SourceAlias, matches)

		content, err := cache.getRaw(filepath.Join(kbRoot, m.Path))
		if err == nil {
			hits, contentMatches := countContentAndCollect(terms, content)
			bd.ContentHits = min(hits, contentCap)
			matches = append(matches, contentMatches...)
		}
	}

	score := bd.TagHits*tagWeight +
		bd.TitleHits*titleWeight +
		bd.AliasHits*aliasWeight +
		bd.SummaryHits*summaryWeight +
		bd.HeadingHits*headingWeight +
		bd.KeywordHits*keywordWeight +
		bd.ContentHits

	if score == 0 {
		return Result{}, false
	}

	absPath := filepath.Join(kbRoot, m.Path)
	return Result{
		Path:      absPath,
		RelPath:   m.Path,
		Title:     m.Title,
		Summary:   m.Summary,
		Tags:      m.Tags,
		Score:     score,
		Breakdown: bd,
		Matches:   dedupeMatches(matches),
	}, true
}

func buildTagVocab(metas []*meta.DocumentMeta) map[string]struct{} {
	vocab := make(map[string]struct{})
	for _, m := range metas {
		for _, t := range m.Tags {
			t = strings.ToLower(strings.TrimSpace(t))
			if t != "" {
				vocab[t] = struct{}{}
			}
		}
	}
	return vocab
}

func matchTags(docTags []string, searchTags []string, mode TagMode) (int, []LineMatch) {
	if len(searchTags) == 0 {
		return 0, nil
	}

	searchSet := make(map[string]struct{}, len(searchTags))
	for _, t := range searchTags {
		searchSet[strings.ToLower(strings.TrimSpace(t))] = struct{}{}
	}

	hits := 0
	var matches []LineMatch
	for _, t := range docTags {
		lower := strings.ToLower(strings.TrimSpace(t))
		if _, ok := searchSet[lower]; ok {
			hits++
			matches = append(matches, LineMatch{Line: 0, Text: t, Term: lower, Source: SourceTag})
		}
	}

	if mode == TagModeAND || mode == "" {
		if hits < len(searchSet) {
			return 0, nil
		}
	}

	return hits, matches
}

func countAndCollect(terms []string, text, source string, base []LineMatch) (int, []LineMatch) {
	lower := strings.ToLower(text)
	total := 0
	matches := base
	for _, term := range terms {
		c := strings.Count(lower, term)
		if c > 0 {
			total += c
			matches = appendLineMatches(matches, text, term, source, c)
		}
	}
	return total, matches
}

func countSliceAndCollect(terms []string, items []string, source string, base []LineMatch) (int, []LineMatch) {
	total := 0
	matches := base
	for _, item := range items {
		itemHits, itemMatches := countAndCollect(terms, item, source, nil)
		total += itemHits
		matches = append(matches, itemMatches...)
	}
	return total, matches
}

func countContentAndCollect(terms []string, content string) (int, []LineMatch) {
	lines := splitLines(content)
	total := 0
	var matches []LineMatch
	for i, line := range lines {
		lineLower := strings.ToLower(line)
		for _, term := range terms {
			c := strings.Count(lineLower, term)
			if c > 0 {
				total += c
				matches = append(matches, LineMatch{
					Line:   i + 1,
					Text:   line,
					Term:   term,
					Source: SourceContent,
				})
			}
		}
	}
	return total, matches
}

func appendLineMatches(base []LineMatch, text, term, source string, count int) []LineMatch {
	// For non-content sources we do not have line numbers; record one match.
	if count <= 0 {
		return base
	}
	return append(base, LineMatch{
		Line:   0,
		Text:   truncate(text, 200),
		Term:   term,
		Source: source,
	})
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func dedupeMatches(matches []LineMatch) []LineMatch {
	seen := make(map[string]struct{}, len(matches))
	var out []LineMatch
	for _, m := range matches {
		key := fmt.Sprintf("%d:%s:%s:%s", m.Line, m.Source, m.Term, m.Text)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, m)
	}
	return out
}

func sortResults(results []Result) {
	sort.SliceStable(results, func(i, j int) bool {
		if results[i].Score != results[j].Score {
			return results[i].Score > results[j].Score
		}
		return results[i].Path < results[j].Path
	})
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

// contentCache caches file contents for the duration of a single search call.
type contentCache struct {
	raw map[string]string // absPath -> original content
}

func newContentCache() *contentCache {
	return &contentCache{raw: make(map[string]string)}
}

func (c *contentCache) getRaw(absPath string) (string, error) {
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
