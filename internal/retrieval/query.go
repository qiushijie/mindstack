package retrieval

import (
	"strings"
	"unicode"

	"mindstack/internal/meta"
)

// BuildQueryForMode constructs the query and options for a search mode,
// shared by the CLI and the desktop app.
func BuildQueryForMode(raw string, mode Mode, tagVocab map[string]struct{}) (Query, Options) {
	opts := Options{Mode: mode, TagMode: TagModeOR}
	var q Query
	switch mode {
	case ModeTag:
		opts.TagMode = TagModeAND
		q = Query{Raw: raw, Tags: NormalizeTagQuery(raw)}
	case ModeFulltext:
		q = Query{Raw: raw, Terms: NormalizeFulltextQuery(raw)}
		if p := detectPhrase(raw); p != "" {
			q.Phrases = []string{p}
		}
	case ModeHybrid:
		q = BuildQuery(raw, tagVocab)
	default:
		q = Query{Raw: raw}
	}
	return q, opts
}

// CollectTagVocab builds the lowercased tag vocabulary from scanned metas.
func CollectTagVocab(metas []*meta.DocumentMeta) map[string]struct{} {
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

	if p := detectPhrase(raw); p != "" {
		q.Phrases = []string{p}
	}

	return q
}

// detectPhrase returns the raw query (lowercased, whitespace stripped) as a
// phrase when it includes CJK characters, so the string can be matched as a
// unit with high weight. Matching is whitespace-insensitive on both sides, so
// "复审第 7 轮" also matches "复审第7轮". Returns "" for non-CJK queries.
//
// For mixed-language queries (e.g. "hello 世界") the whole string, latin part
// included, is collapsed into one phrase ("hello世界"). CJK text has no word
// separators, so adjacency after whitespace removal is a reasonable exactness
// heuristic there; for the latin part it is stricter than ideal, because
// "hello 世界" will not phrase-match "hello 的世界". The tradeoff is accepted:
// the phrase score is a bonus on top of the per-term scores, which still
// match such documents independently.
func detectPhrase(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	hasHan := false
	for _, r := range raw {
		if unicode.Is(unicode.Han, r) {
			hasHan = true
			break
		}
	}
	if !hasHan {
		return ""
	}
	return strings.ToLower(stripWhitespace(raw))
}

// stripWhitespace removes all whitespace runes from s.
func stripWhitespace(s string) string {
	var sb strings.Builder
	for _, r := range s {
		if !unicode.IsSpace(r) {
			sb.WriteRune(r)
		}
	}
	return sb.String()
}

// expandFallbackTerms re-tokenizes a raw query for the zero-result fallback:
//   - each CJK run is split into overlapping bigrams (a single-character run
//     stays a unigram), because CJK text has no word separators and a long
//     Chinese sentence otherwise becomes one unmatchable substring term;
//   - latin tokens are kept whole (lowercased), and camelCase / snake_case /
//     kebab-case tokens additionally contribute their sub-words, so
//     "exitCode" can still match content written as "exit code".
//
// All returned terms are lowercased and deduplicated.
func expandFallbackTerms(raw string) []string {
	var terms []string
	for _, word := range strings.Fields(raw) {
		if strings.TrimSpace(word) == "" {
			continue
		}
		var cjkRun, latinRun []rune
		flushCJK := func() {
			if len(cjkRun) == 1 {
				terms = append(terms, string(cjkRun))
			} else {
				for i := 0; i+1 < len(cjkRun); i++ {
					terms = append(terms, string(cjkRun[i:i+2]))
				}
			}
			cjkRun = nil
		}
		flushLatin := func() {
			if len(latinRun) == 0 {
				return
			}
			w := string(latinRun) // original case: camel boundaries still visible
			terms = append(terms, strings.ToLower(w))
			for _, sub := range splitLatinSubwords(w) {
				terms = append(terms, strings.ToLower(sub))
			}
			latinRun = nil
		}
		for _, r := range word {
			// Fields already split on whitespace, so a word contains only
			// CJK and non-space latin/punctuation runes.
			switch {
			case unicode.Is(unicode.Han, r):
				flushLatin()
				cjkRun = append(cjkRun, r)
			default:
				flushCJK()
				latinRun = append(latinRun, r)
			}
		}
		flushCJK()
		flushLatin()
	}
	return dedupeTerms(terms)
}

// splitLatinSubwords breaks w on '-', '_', '.' and lower→Upper case
// boundaries, returning the sub-words in their original case. Returns nil
// when w is already a single plain word.
func splitLatinSubwords(w string) []string {
	var subs []string
	var cur []rune
	runes := []rune(w)
	flush := func() {
		if len(cur) > 0 {
			subs = append(subs, string(cur))
		}
		cur = nil
	}
	for i, r := range runes {
		if r == '-' || r == '_' || r == '.' {
			flush()
			continue
		}
		if i > 0 && unicode.IsUpper(r) && len(cur) > 0 && unicode.IsLower(cur[len(cur)-1]) {
			flush()
		}
		cur = append(cur, r)
	}
	flush()
	if len(subs) <= 1 {
		return nil
	}
	return subs
}

func dedupeTerms(terms []string) []string {
	seen := make(map[string]struct{}, len(terms))
	out := terms[:0]
	for _, t := range terms {
		if _, ok := seen[t]; ok {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

// sameStringSet reports whether a and b contain the same strings, ignoring
// order and duplicates.
func sameStringSet(a, b []string) bool {
	if len(a) == 0 || len(b) == 0 {
		return len(a) == len(b)
	}
	set := make(map[string]int, len(a))
	for _, s := range a {
		set[s]++
	}
	for _, s := range b {
		set[s]--
		if set[s] < 0 {
			return false
		}
	}
	for _, n := range set {
		if n != 0 {
			return false
		}
	}
	return true
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

// normalizeLooseTerms splits raw on whitespace and commas, lowercasing each
// token. Used by zero-result fallbacks where the original query syntax (a
// single tag, a comma list) must be reinterpreted as free text.
func normalizeLooseTerms(raw string) []string {
	var terms []string
	for _, p := range strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || unicode.IsSpace(r)
	}) {
		p = normalizeTerm(p)
		if p != "" {
			terms = append(terms, p)
		}
	}
	return dedupeTerms(terms)
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
