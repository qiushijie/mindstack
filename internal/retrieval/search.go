package retrieval

import (
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"

	"mindstack/internal/meta"
)

const (
	tagWeight     = 5.0
	titleWeight   = 4.0
	aliasWeight   = 4.0
	summaryWeight = 3.0
	headingWeight = 3.0
	keywordWeight = 3.0
	phraseWeight  = 8.0
	contentCap    = 20
	// phraseContentCap caps phrase occurrences counted in body content. It is
	// stricter than contentCap because each occurrence is multiplied by
	// phraseWeight (8.0 vs at most 1.0 per term occurrence), so far fewer
	// repetitions are needed before a spammed phrase dominates the score.
	phraseContentCap = 5
	// shortDocLines is the reference document length; content hits in longer
	// documents are downweighted so sheer length does not dominate ranking.
	shortDocLines = 200.0
)

// Search runs a retrieval query against the knowledge base.
// The returned Result.Path values are absolute paths.
func Search(kbRoot string, query Query, opts Options) (*ResultSet, error) {
	metas, err := meta.ScanAll(kbRoot, opts.Subdir)
	if err != nil {
		return nil, fmt.Errorf("scan meta: %w", err)
	}

	tagVocab := CollectTagVocab(metas)

	// If the caller supplied an empty query but the raw string looks like a tag list,
	// re-normalize it. This keeps the CLI tag mode simple.
	if len(query.Tags) == 0 && len(query.Terms) == 0 && strings.Contains(query.Raw, ",") {
		query.Tags = NormalizeTagQuery(query.Raw)
	}

	cache := newContentCache()
	results := scoreAll(kbRoot, metas, cache, query, opts)

	// An empty mode behaves as ModeTag (see scoreDocument); normalize once so
	// the fallback and suggestion branches below agree with that.
	mode := opts.Mode
	if mode == "" {
		mode = ModeTag
	}

	effectiveMode := opts.Mode
	if mode == ModeTag && len(results) == 0 && len(query.Tags) > 0 {
		// Automatic fallback: exact tag matching found nothing; retry as
		// hybrid so the same words can still hit title/summary/content.
		fb := opts
		fb.Mode = ModeHybrid
		fb.TagMode = TagModeOR
		results = scoreAll(kbRoot, metas, cache, query, fb)
		effectiveMode = ModeHybrid
	}

	sortResults(results)

	total := len(results)
	if opts.Limit > 0 && len(results) > opts.Limit {
		results = results[:opts.Limit]
	}

	rs := &ResultSet{
		Query:    query.Raw,
		Mode:     opts.Mode,
		Results:  results,
		Total:    total,
		Returned: len(results),
	}
	if effectiveMode != "" && effectiveMode != opts.Mode {
		rs.EffectiveMode = effectiveMode
	}
	if mode == ModeTag {
		if missed := missingTags(query.Tags, tagVocab); len(missed) > 0 {
			rs.Suggestions = SuggestTags(missed, tagVocab, 5)
		}
	}
	return rs, nil
}

func scoreAll(kbRoot string, metas []*meta.DocumentMeta, cache *contentCache, query Query, opts Options) []Result {
	var results []Result
	for _, m := range metas {
		r, ok := scoreDocument(kbRoot, m, cache, query, opts)
		if !ok {
			continue
		}
		results = append(results, r)
	}
	return results
}

// missingTags returns the query tags that do not exist in the vocabulary.
func missingTags(tags []string, vocab map[string]struct{}) []string {
	var missed []string
	for _, t := range tags {
		if _, ok := vocab[t]; !ok {
			missed = append(missed, t)
		}
	}
	return missed
}

func scoreDocument(kbRoot string, m *meta.DocumentMeta, cache *contentCache, query Query, opts Options) (Result, bool) {
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

	var titleScore, summaryScore, headingScore, keywordScore, aliasScore float64
	var contentScore, phraseScore float64

	if includeText && len(terms) > 0 {
		bd.TitleHits, matches = countAndCollect(terms, m.Title, SourceTitle, matches)
		titleScore = weightedCount(terms, m.Title) * titleWeight

		bd.SummaryHits, matches = countAndCollect(terms, m.Summary, SourceSummary, matches)
		summaryScore = weightedCount(terms, m.Summary) * summaryWeight

		for _, h := range m.Headings {
			hits, m2 := countAndCollect(terms, h.Text, SourceHeading, nil)
			bd.HeadingHits += hits
			headingScore += weightedCount(terms, h.Text) * headingWeight
			matches = append(matches, m2...)
		}

		bd.KeywordHits, matches = countSliceAndCollect(terms, m.Keywords, SourceKeyword, matches)
		keywordScore = weightedSliceCount(terms, m.Keywords) * keywordWeight

		bd.AliasHits, matches = countSliceAndCollect(terms, m.Aliases, SourceAlias, matches)
		aliasScore = weightedSliceCount(terms, m.Aliases) * aliasWeight
	}

	if includeText && (len(terms) > 0 || len(query.Phrases) > 0) {
		content, err := cache.getRaw(filepath.Join(kbRoot, m.Path))
		if err == nil {
			lower := strings.ToLower(content)
			if len(terms) > 0 {
				hits, contentMatches, lineCount := countContentAndCollect(terms, content)
				bd.ContentHits = min(hits, contentCap)
				matches = append(matches, contentMatches...)
				wc := 0.0
				for _, term := range terms {
					// Cap per-term occurrences before weighting, so a
					// low-weight single-rune term repeated hundreds of
					// times cannot reach the cap.
					wc += termWeight(term) * float64(min(strings.Count(lower, term), contentCap))
				}
				contentScore = math.Min(wc, float64(contentCap)) * lengthFactor(lineCount)
			}
			for _, p := range query.Phrases {
				if p == "" {
					continue
				}
				// Whole-string CJK queries are also matched as a unit with a
				// high weight, so exact-phrase documents outrank documents
				// that merely contain the individual terms. Matching ignores
				// whitespace on both sides ("复审第 7 轮" == "复审第7轮").
				titleNospace := stripWhitespace(strings.ToLower(m.Title))
				if c := strings.Count(titleNospace, p); c > 0 {
					phraseScore += float64(c) * phraseWeight
					matches = append(matches, LineMatch{Line: 0, Text: truncate(m.Title, 200), Term: p, Source: SourceTitle})
				}
				summaryNospace := stripWhitespace(strings.ToLower(m.Summary))
				if c := strings.Count(summaryNospace, p); c > 0 {
					phraseScore += float64(c) * phraseWeight
					matches = append(matches, LineMatch{Line: 0, Text: truncate(m.Summary, 200), Term: p, Source: SourceSummary})
				}
				if c := min(strings.Count(stripWhitespace(lower), p), phraseContentCap); c > 0 {
					phraseScore += float64(c) * phraseWeight
					// Body hits have no single line to point at; record a
					// placeholder so content phrase hits stay explainable
					// like the title/summary phrase hits above.
					matches = append(matches, LineMatch{Line: 0, Term: p, Source: SourceContent})
				}
			}
		}
	}

	score := float64(bd.TagHits)*tagWeight +
		titleScore +
		aliasScore +
		summaryScore +
		headingScore +
		keywordScore +
		contentScore +
		phraseScore

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

// termWeight downweights single-rune terms, which match almost everywhere
// (a lone digit or CJK character) and mostly produce noise.
func termWeight(term string) float64 {
	if utf8.RuneCountInString(term) <= 1 {
		return 0.2
	}
	return 1.0
}

// weightedCount sums per-term occurrence counts in text, each multiplied by
// the term's weight.
func weightedCount(terms []string, text string) float64 {
	lower := strings.ToLower(text)
	total := 0.0
	for _, term := range terms {
		total += termWeight(term) * float64(strings.Count(lower, term))
	}
	return total
}

// weightedSliceCount is weightedCount over a list of strings.
func weightedSliceCount(terms []string, items []string) float64 {
	total := 0.0
	for _, item := range items {
		total += weightedCount(terms, item)
	}
	return total
}

// lengthFactor downweights content hits in long documents.
func lengthFactor(lines int) float64 {
	if float64(lines) <= shortDocLines {
		return 1.0
	}
	return shortDocLines / float64(lines)
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

func countContentAndCollect(terms []string, content string) (int, []LineMatch, int) {
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
	return total, matches, len(lines)
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
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "..."
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
