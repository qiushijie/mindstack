package retrieval

import (
	"strings"
	"unicode"
)

// BuildQuery normalizes a raw query into terms and tags.
// If the raw query contains commas, every non-empty token is treated as a tag.
// Otherwise, tokens present in tagVocab are tags and the rest are full-text terms.
// An empty vocabulary makes every token a full-text term.
func BuildQuery(raw string, tagVocab map[string]struct{}) Query {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return Query{Raw: raw}
	}

	q := Query{Raw: raw}

	// Comma-separated input is interpreted as an explicit tag list.
	if strings.Contains(raw, ",") {
		for _, p := range strings.Split(raw, ",") {
			p = normalizeTerm(p)
			if p != "" {
				q.Tags = append(q.Tags, p)
			}
		}
		return q
	}

	for _, p := range strings.Fields(raw) {
		p = normalizeTerm(p)
		if p == "" {
			continue
		}
		q.Terms = append(q.Terms, p)
		if isTag(p, tagVocab) {
			q.Tags = append(q.Tags, p)
		}
	}

	return q
}

// NormalizeTagQuery parses a comma-separated tag query into individual tags.
func NormalizeTagQuery(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	var tags []string
	for _, p := range strings.Split(raw, ",") {
		p = normalizeTerm(p)
		if p != "" {
			tags = append(tags, p)
		}
	}
	return tags
}

// NormalizeFulltextQuery splits a full-text query into individual terms.
func NormalizeFulltextQuery(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	var terms []string
	for _, p := range strings.Fields(raw) {
		p = normalizeTerm(p)
		if p != "" {
			terms = append(terms, p)
		}
	}
	return terms
}

func normalizeTerm(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func isTag(term string, vocab map[string]struct{}) bool {
	if len(vocab) == 0 {
		return false
	}
	_, ok := vocab[term]
	return ok
}

// ToLowerAlphanumeric lowercases a string and replaces punctuation with spaces,
// then collapses whitespace. Useful for comparing tags regardless of separators.
func ToLowerAlphanumeric(s string) string {
	var sb strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			sb.WriteRune(unicode.ToLower(r))
		} else {
			sb.WriteRune(' ')
		}
	}
	return strings.Join(strings.Fields(sb.String()), " ")
}
