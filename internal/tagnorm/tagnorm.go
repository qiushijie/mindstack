// Package tagnorm provides pure functions for tag normalization and
// near-duplicate grouping. It is the shared foundation for keeping the tag
// vocabulary of a knowledge base consistent across generation, search, and
// consolidation.
package tagnorm

import (
	"strings"
	"unicode"
)

// protectedTechTags maps tech terms whose punctuation is part of their
// identity to a safe canonical form. The lookup runs before any punctuation
// stripping so that "c++" and "c#" do not silently collapse into "c".
var protectedTechTags = map[string]string{
	"c++":  "cpp",
	"c#":   "csharp",
	"f#":   "fsharp",
	".net": "dotnet",
}

// Normalize returns the canonical form of a tag: lowercased, spaces and
// underscores collapsed to single hyphens, punctuation stripped.
func Normalize(tag string) string {
	if canonical, ok := protectedTechTags[strings.ToLower(strings.TrimSpace(tag))]; ok {
		return canonical
	}
	var sb strings.Builder
	pendingSep := false
	for _, r := range strings.TrimSpace(tag) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if pendingSep && sb.Len() > 0 {
				sb.WriteByte('-')
			}
			pendingSep = false
			sb.WriteRune(unicode.ToLower(r))
		case unicode.IsSpace(r) || r == '_' || r == '-':
			pendingSep = true
		default:
			// Other punctuation is stripped without acting as a separator.
		}
	}
	return sb.String()
}

// NormalizeAll normalizes a tag list and dedupes, preserving first-seen order.
func NormalizeAll(tags []string) []string {
	var out []string
	seen := make(map[string]struct{}, len(tags))
	for _, t := range tags {
		n := Normalize(t)
		if n == "" {
			continue
		}
		if _, ok := seen[n]; ok {
			continue
		}
		seen[n] = struct{}{}
		out = append(out, n)
	}
	return out
}

// nonPluralWords lists trailing-"s" words that are not English plurals;
// stripping their final "s" would corrupt them (news->new, physics->physic).
var nonPluralWords = map[string]bool{
	"news":        true,
	"dns":         true,
	"physics":     true,
	"mathematics": true,
	"economics":   true,
	"politics":    true,
	"ethics":      true,
	"series":      true,
	"species":     true,
	"kubernetes":  true,
}

// singularOverrides maps words whose singular form the generic suffix rules
// get wrong (movies->movy instead of movie).
var singularOverrides = map[string]string{
	"movies": "movie",
}

// SingularKey returns a conservative singular form for English tags
// ("ies"->"y", trailing "es"/"s" stripping with a stoplist). CJK and digits
// are untouched.
func SingularKey(tag string) string {
	n := Normalize(tag)
	// Too-short words are never stripped ("go", "os", "ai").
	if len(n) <= 3 {
		return n
	}
	// Words that end in "s" but are not plurals.
	if nonPluralWords[n] {
		return n
	}
	// Stoplist endings: stripping the trailing "s" would corrupt the word
	// (business/progress, analysis, status, alias/atlas/bias).
	if strings.HasSuffix(n, "ss") || strings.HasSuffix(n, "is") ||
		strings.HasSuffix(n, "us") || strings.HasSuffix(n, "as") {
		return n
	}
	if singular, ok := singularOverrides[n]; ok {
		return singular
	}
	if strings.HasSuffix(n, "ies") && len(n) > 4 {
		return n[:len(n)-3] + "y"
	}
	// Sibilant + "es" plurals keep the stem ("boxes"->"box", "wishes"->"wish",
	// "classes"->"class").
	if strings.HasSuffix(n, "xes") || strings.HasSuffix(n, "zes") ||
		strings.HasSuffix(n, "ches") || strings.HasSuffix(n, "shes") ||
		strings.HasSuffix(n, "sses") {
		return n[:len(n)-2]
	}
	if strings.HasSuffix(n, "s") {
		return n[:len(n)-1]
	}
	return n
}

// GroupKey is Normalize + SingularKey; tags sharing a GroupKey are
// consolidation candidates.
func GroupKey(tag string) string {
	return SingularKey(tag)
}
