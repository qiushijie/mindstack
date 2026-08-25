package retrieval

import (
	"sort"
	"strings"
	"unicode/utf8"
)

// SuggestTags returns up to max vocabulary tags similar to the given query
// tags, for "did you mean" hints. Only tags whose raw form exactly equals a
// query tag are skipped. Tags whose normalized form (ToLowerAlphanumeric)
// equals the query's but whose raw form differs (e.g. query "rest api" vs
// vocabulary "rest-api") rank first — they are the strongest did-you-mean
// candidates — followed by prefix matches on the normalized forms, then tags
// within a small Levenshtein distance.
func SuggestTags(queryTags []string, vocab map[string]struct{}, max int) []string {
	if max <= 0 {
		return nil
	}

	seen := make(map[string]bool)
	var normalizedEqual, prefix, fuzzy []string
	type fuzzyHit struct {
		tag  string
		dist int
	}
	var fuzzyHits []fuzzyHit

	for _, qt := range queryTags {
		qn := ToLowerAlphanumeric(qt)
		if qn == "" {
			continue
		}
		for tag := range vocab {
			if seen[tag] {
				continue
			}
			if tag == qt {
				continue
			}
			tn := ToLowerAlphanumeric(tag)
			if tn == "" {
				continue
			}
			if tn == qn {
				seen[tag] = true
				normalizedEqual = append(normalizedEqual, tag)
				continue
			}
			if strings.HasPrefix(tn, qn) || strings.HasPrefix(qn, tn) {
				seen[tag] = true
				prefix = append(prefix, tag)
				continue
			}
			if d := levenshtein(qn, tn); d <= maxSuggestDistance(qn) {
				seen[tag] = true
				fuzzyHits = append(fuzzyHits, fuzzyHit{tag, d})
			}
		}
	}

	sort.Strings(normalizedEqual)
	sort.Strings(prefix)
	sort.Slice(fuzzyHits, func(i, j int) bool {
		if fuzzyHits[i].dist != fuzzyHits[j].dist {
			return fuzzyHits[i].dist < fuzzyHits[j].dist
		}
		return fuzzyHits[i].tag < fuzzyHits[j].tag
	})
	for _, fh := range fuzzyHits {
		fuzzy = append(fuzzy, fh.tag)
	}

	out := append(normalizedEqual, prefix...)
	out = append(out, fuzzy...)
	if len(out) > max {
		out = out[:max]
	}
	return out
}

// maxSuggestDistance tolerates longer edits for longer queries.
func maxSuggestDistance(normalized string) int {
	d := utf8.RuneCountInString(normalized) / 3
	if d < 1 {
		return 1
	}
	return d
}

// levenshtein computes the rune-based edit distance between a and b.
func levenshtein(a, b string) int {
	ra, rb := []rune(a), []rune(b)
	if len(ra) == 0 {
		return len(rb)
	}
	if len(rb) == 0 {
		return len(ra)
	}

	prev := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur := make([]int, len(rb)+1)
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 0
			if ra[i-1] != rb[j-1] {
				cost = 1
			}
			cur[j] = min3(cur[j-1]+1, prev[j]+1, prev[j-1]+cost)
		}
		prev = cur
	}
	return prev[len(rb)]
}

func min3(a, b, c int) int {
	m := a
	if b < m {
		m = b
	}
	if c < m {
		m = c
	}
	return m
}
