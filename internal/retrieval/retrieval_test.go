package retrieval

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"

	"mindstack/internal/meta"
	"mindstack/internal/workspace"
)

func setupTestKB(t *testing.T) string {
	t.Helper()
	kbRoot := t.TempDir()

	dirs := []string{
		filepath.Join(kbRoot, workspace.KnowledgeBaseDir),
		filepath.Join(kbRoot, "api-specs"),
		filepath.Join(kbRoot, "adr"),
	}
	for _, d := range dirs {
		os.MkdirAll(d, 0755)
	}

	os.WriteFile(filepath.Join(kbRoot, "api-specs", "rest-api.md"), []byte("# REST API\n\nRetry uses exponential backoff.\nDefault retry attempts: 3."), 0644)
	os.WriteFile(filepath.Join(kbRoot, "adr", "001-database.md"), []byte("# ADR-001 Database Selection\n\nWe chose PostgreSQL."), 0644)

	meta.SaveMeta(kbRoot, "api-specs/rest-api.md", &meta.DocumentMeta{
		Title:    "REST API",
		Summary:  "API retry behavior and policy.",
		Tags:     []string{"api-spec", "rest", "frontend", "backend"},
		Status:   "active",
		Headings: []meta.Heading{{Level: 1, Text: "REST API"}},
	})
	meta.SaveMeta(kbRoot, "adr/001-database.md", &meta.DocumentMeta{
		Title:    "ADR-001 Database Selection",
		Summary:  "Architecture decision record for the database.",
		Tags:     []string{"architecture", "adr", "database"},
		Status:   "active",
		Headings: []meta.Heading{{Level: 1, Text: "ADR-001 Database Selection"}},
	})

	return kbRoot
}

func TestSearch_TagAND(t *testing.T) {
	kbRoot := setupTestKB(t)

	rs, err := Search(kbRoot, Query{Raw: "rest,frontend", Tags: []string{"rest", "frontend"}}, Options{Mode: ModeTag})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total != 1 {
		t.Fatalf("expected 1 result, got %d", rs.Total)
	}
	wantPath := filepath.Join(kbRoot, "api-specs", "rest-api.md")
	if rs.Results[0].Path != wantPath {
		t.Fatalf("expected path %s, got %s", wantPath, rs.Results[0].Path)
	}
}

func TestSearch_TagOR(t *testing.T) {
	kbRoot := setupTestKB(t)

	rs, err := Search(kbRoot, Query{Raw: "rest,architecture", Tags: []string{"rest", "architecture"}}, Options{Mode: ModeTag, TagMode: TagModeOR})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total != 2 {
		t.Fatalf("expected 2 results, got %d", rs.Total)
	}
}

func TestSearch_TagZeroResultFallsBackToHybrid(t *testing.T) {
	kbRoot := setupTestKB(t)

	// No document has both "rest" and "architecture". The strict AND tag
	// match finds nothing, so Search automatically falls back to hybrid mode
	// and reports the effective mode.
	rs, err := Search(kbRoot, Query{Raw: "rest,architecture", Tags: []string{"rest", "architecture"}}, Options{Mode: ModeTag})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total == 0 {
		t.Fatalf("expected hybrid fallback results, got none")
	}
	if rs.EffectiveMode != ModeHybrid {
		t.Fatalf("expected EffectiveMode %q, got %q", ModeHybrid, rs.EffectiveMode)
	}
}

func TestSearch_FulltextSortedByScore(t *testing.T) {
	kbRoot := setupTestKB(t)

	rs, err := Search(kbRoot, Query{Raw: "retry", Terms: []string{"retry"}}, Options{Mode: ModeFulltext})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total == 0 {
		t.Fatalf("expected results, got none")
	}

	first := rs.Results[0]
	if first.Score == 0 {
		t.Fatalf("expected non-zero score for top result")
	}

	for i := 1; i < len(rs.Results); i++ {
		if rs.Results[i].Score > rs.Results[i-1].Score {
			t.Fatalf("results not sorted by score desc at index %d", i)
		}
	}

	wantPath := filepath.Join(kbRoot, "api-specs", "rest-api.md")
	if first.Path != wantPath {
		t.Fatalf("expected top result %s, got %s", wantPath, first.Path)
	}
}

func TestSearch_ContentMatchPreservesCase(t *testing.T) {
	kbRoot := setupTestKB(t)

	rs, err := Search(kbRoot, Query{Raw: "retry", Terms: []string{"retry"}}, Options{Mode: ModeFulltext})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total == 0 {
		t.Fatalf("expected results, got none")
	}

	for _, r := range rs.Results {
		if r.Path != filepath.Join(kbRoot, "api-specs", "rest-api.md") {
			continue
		}
		for _, m := range r.Matches {
			if m.Source != SourceContent {
				continue
			}
			if m.Text == strings.ToLower(m.Text) {
				t.Fatalf("expected original-case content match text, got %q", m.Text)
			}
		}
	}
}

func TestSearch_HybridCombinesTagAndFulltext(t *testing.T) {
	kbRoot := setupTestKB(t)

	rs, err := Search(kbRoot, Query{Raw: "retry api-spec", Tags: []string{"api-spec"}, Terms: []string{"retry"}}, Options{Mode: ModeHybrid, TagMode: TagModeOR})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total == 0 {
		t.Fatalf("expected results, got none")
	}

	first := rs.Results[0]
	if first.Breakdown.TagHits == 0 {
		t.Fatalf("expected tag hits in hybrid result")
	}
	if first.Breakdown.ContentHits == 0 && first.Breakdown.TitleHits == 0 {
		t.Fatalf("expected fulltext hits in hybrid result")
	}
}

func TestSearch_AbsolutePaths(t *testing.T) {
	kbRoot := setupTestKB(t)

	rs, err := Search(kbRoot, Query{Raw: "rest", Tags: []string{"rest"}}, Options{Mode: ModeTag})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total != 1 {
		t.Fatalf("expected 1 result, got %d", rs.Total)
	}
	if !filepath.IsAbs(rs.Results[0].Path) {
		t.Fatalf("expected absolute path, got %s", rs.Results[0].Path)
	}
	if rs.Results[0].RelPath == "" {
		t.Fatalf("expected RelPath to be set")
	}
}

func TestSearch_Limit(t *testing.T) {
	kbRoot := setupTestKB(t)

	rs, err := Search(kbRoot, Query{Raw: "rest,architecture", Tags: []string{"rest", "architecture"}}, Options{Mode: ModeTag, TagMode: TagModeOR, Limit: 1})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total != 2 {
		t.Fatalf("expected Total=2 (matches before limit), got %d", rs.Total)
	}
	if rs.Returned != 1 || len(rs.Results) != 1 {
		t.Fatalf("expected Returned=1 due to limit, got %d", rs.Returned)
	}
}

func TestBuildQueryForMode(t *testing.T) {
	vocab := map[string]struct{}{"api-spec": {}}

	q, opts := BuildQueryForMode("rest,frontend", ModeTag, nil)
	if opts.Mode != ModeTag || opts.TagMode != TagModeAND {
		t.Fatalf("tag mode: unexpected opts %+v", opts)
	}
	if len(q.Tags) != 2 || len(q.Terms) != 0 {
		t.Fatalf("tag mode: unexpected query %+v", q)
	}

	q, opts = BuildQueryForMode("retry policy", ModeFulltext, nil)
	if opts.TagMode != TagModeOR || len(q.Terms) != 2 || len(q.Tags) != 0 {
		t.Fatalf("fulltext mode: unexpected query %+v opts %+v", q, opts)
	}

	q, _ = BuildQueryForMode("retry api-spec", ModeHybrid, vocab)
	if len(q.Tags) != 1 || q.Tags[0] != "api-spec" || len(q.Terms) != 2 {
		t.Fatalf("hybrid mode: unexpected query %+v", q)
	}
}

func TestCollectTagVocab(t *testing.T) {
	metas := []*meta.DocumentMeta{
		{Tags: []string{"Rest-API", " go "}},
		{Tags: []string{"rest-api", ""}},
	}
	vocab := CollectTagVocab(metas)
	if len(vocab) != 2 {
		t.Fatalf("expected 2 vocab entries, got %v", vocab)
	}
	if _, ok := vocab["rest-api"]; !ok {
		t.Fatalf("expected lowercased trimmed tag in vocab, got %v", vocab)
	}
}

func TestTruncateMultibyte(t *testing.T) {
	in := strings.Repeat("复审", 30) // 60 runes, 180 bytes
	out := truncate(in, 50)
	if !utf8.ValidString(out) {
		t.Fatalf("truncate produced invalid UTF-8: %q", out)
	}
	if got := utf8.RuneCountInString(out); got != 53 { // 50 runes + "..."
		t.Fatalf("expected 53 runes, got %d", got)
	}

	short := "短文本"
	if truncate(short, 50) != short {
		t.Fatalf("short string should pass through unchanged")
	}
}

func TestBuildQuery_TagInput(t *testing.T) {
	q := BuildQuery("rest, frontend", nil)
	if len(q.Tags) != 2 || q.Tags[0] != "rest" || q.Tags[1] != "frontend" {
		t.Fatalf("expected tags [rest frontend], got %v", q.Tags)
	}
	if len(q.Terms) != 0 {
		t.Fatalf("expected no terms for comma input, got %v", q.Terms)
	}
}

func TestBuildQuery_FulltextInput(t *testing.T) {
	q := BuildQuery("retry policy", nil)
	if len(q.Terms) != 2 || q.Terms[0] != "retry" || q.Terms[1] != "policy" {
		t.Fatalf("expected terms [retry policy], got %v", q.Terms)
	}
	if len(q.Tags) != 0 {
		t.Fatalf("expected no tags without vocab, got %v", q.Tags)
	}
}

func TestBuildQuery_HybridWithVocab(t *testing.T) {
	vocab := map[string]struct{}{"api-spec": {}}
	q := BuildQuery("retry api-spec", vocab)
	if len(q.Tags) != 1 || q.Tags[0] != "api-spec" {
		t.Fatalf("expected tag [api-spec], got %v", q.Tags)
	}
	if len(q.Terms) != 2 || q.Terms[0] != "retry" {
		t.Fatalf("expected terms [retry api-spec], got %v", q.Terms)
	}
}

func TestNormalizeTagQuery(t *testing.T) {
	tags := NormalizeTagQuery("rest , frontend")
	if len(tags) != 2 {
		t.Fatalf("expected 2 tags, got %v", tags)
	}
}

func TestNormalizeFulltextQuery(t *testing.T) {
	terms := NormalizeFulltextQuery("retry policy")
	if len(terms) != 2 {
		t.Fatalf("expected 2 terms, got %v", terms)
	}
}

func TestSearch_KeywordsAndAliases(t *testing.T) {
	kbRoot := setupTestKB(t)

	// Overwrite api-specs/rest-api.md meta with keywords and aliases.
	meta.SaveMeta(kbRoot, "api-specs/rest-api.md", &meta.DocumentMeta{
		Title:    "REST API",
		Summary:  "API retry behavior and policy.",
		Tags:     []string{"api-spec", "rest", "frontend", "backend"},
		Status:   "active",
		Headings: []meta.Heading{{Level: 1, Text: "REST API"}},
		Keywords: []string{"retry", "backoff", "http"},
		Aliases:  []string{"RESTful API"},
	})

	rs, err := Search(kbRoot, Query{Raw: "backoff", Terms: []string{"backoff"}}, Options{Mode: ModeFulltext})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total == 0 {
		t.Fatalf("expected keyword hit")
	}
	if rs.Results[0].Breakdown.KeywordHits == 0 {
		t.Fatalf("expected keywordHits > 0")
	}

	rs, err = Search(kbRoot, Query{Raw: "restful", Terms: []string{"restful"}}, Options{Mode: ModeFulltext})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total == 0 {
		t.Fatalf("expected alias hit")
	}
	if rs.Results[0].Breakdown.AliasHits == 0 {
		t.Fatalf("expected aliasHits > 0")
	}
}

func TestSuggestTags_NormalizedEqualRanksFirst(t *testing.T) {
	vocab := map[string]struct{}{
		"rest-api":    {},
		"rest-api-v2": {},
		"playwright":  {},
	}

	// "rest api" normalizes to the same form as the vocabulary tag "rest-api"
	// but differs in raw form; it is the strongest did-you-mean candidate and
	// must rank before mere prefix matches like "rest-api-v2".
	got := SuggestTags([]string{"rest api"}, vocab, 5)
	if len(got) == 0 || got[0] != "rest-api" {
		t.Fatalf("expected rest-api as top suggestion for %q, got %v", "rest api", got)
	}

	// Only a raw exact match is skipped entirely.
	for _, s := range SuggestTags([]string{"rest-api"}, vocab, 5) {
		if s == "rest-api" {
			t.Fatalf("raw-equal tag should not be suggested, got %v", s)
		}
	}
}

func TestSearch_EmptyModeFallsBackToHybrid(t *testing.T) {
	kbRoot := setupTestKB(t)

	// An empty mode behaves as ModeTag; the zero-result fallback must trigger
	// for it just like an explicit ModeTag.
	rs, err := Search(kbRoot, Query{Raw: "rest,architecture", Tags: []string{"rest", "architecture"}}, Options{})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total == 0 {
		t.Fatalf("expected hybrid fallback results for empty mode, got none")
	}
	if rs.EffectiveMode != ModeHybrid {
		t.Fatalf("expected EffectiveMode %q, got %q", ModeHybrid, rs.EffectiveMode)
	}
}

func TestSearch_EmptyModeYieldsSuggestions(t *testing.T) {
	kbRoot := setupTestKB(t)

	rs, err := Search(kbRoot, Query{Raw: "rst", Tags: []string{"rst"}}, Options{})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	found := false
	for _, s := range rs.Suggestions {
		if s == "rest" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected suggestion rest for empty mode, got %v", rs.Suggestions)
	}
}

func TestSearch_PhraseWhitespaceInsensitive(t *testing.T) {
	kbRoot := t.TempDir()
	os.MkdirAll(filepath.Join(kbRoot, workspace.KnowledgeBaseDir), 0755)

	// a.md contains only the no-whitespace form of the phrase; the query uses
	// the spaced form. b.md contains the individual terms scattered, never
	// adjacent, so only a.md can score a phrase hit.
	os.WriteFile(filepath.Join(kbRoot, "a.md"), []byte("# 复审第7轮总结\n\n复审第7轮的结论。\n"), 0644)
	os.WriteFile(filepath.Join(kbRoot, "b.md"), []byte("# 其他\n\n复审第若干次会议记录，数字 7 与 轮 换。\n"), 0644)

	meta.SaveMeta(kbRoot, "a.md", &meta.DocumentMeta{Title: "复审第7轮总结", Summary: ""})
	meta.SaveMeta(kbRoot, "b.md", &meta.DocumentMeta{Title: "其他", Summary: ""})

	q, opts := BuildQueryForMode("复审第 7 轮", ModeFulltext, nil)
	rs, err := Search(kbRoot, q, opts)
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if len(rs.Results) < 2 {
		t.Fatalf("expected 2 results, got %d", len(rs.Results))
	}
	if rs.Results[0].RelPath != "a.md" {
		t.Fatalf("expected a.md (whitespace-insensitive phrase hit) first, got %s", rs.Results[0].RelPath)
	}

	// The phrase placeholder match proves the phrase actually matched despite
	// the whitespace difference; it disappears if whitespace stripping is
	// removed from phrase matching.
	found := false
	for _, m := range rs.Results[0].Matches {
		if m.Source == SourceContent && m.Term == "复审第7轮" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected content phrase match for %q in a.md, got %+v", "复审第7轮", rs.Results[0].Matches)
	}
}

func TestSuggestTags(t *testing.T) {
	vocab := map[string]struct{}{
		"e2e-testing": {},
		"playwright":  {},
		"rest":        {},
	}

	got := SuggestTags([]string{"e2e"}, vocab, 5)
	if len(got) == 0 || got[0] != "e2e-testing" {
		t.Fatalf("expected e2e-testing suggested for e2e, got %v", got)
	}

	got = SuggestTags([]string{"playwrigt"}, vocab, 5)
	if len(got) == 0 || got[0] != "playwright" {
		t.Fatalf("expected playwright suggested for playwrigt, got %v", got)
	}

	if got := SuggestTags([]string{"rest"}, vocab, 5); len(got) != 0 {
		t.Fatalf("exact vocab tag should not be suggested, got %v", got)
	}
}

func TestSearch_TagSuggestionsInResultSet(t *testing.T) {
	kbRoot := setupTestKB(t)

	// "rst" matches no tag exactly; in tag mode the result set should carry
	// suggestions pointing at the real vocabulary tag "rest".
	rs, err := Search(kbRoot, Query{Raw: "rst", Tags: []string{"rst"}}, Options{Mode: ModeTag})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	found := false
	for _, s := range rs.Suggestions {
		if s == "rest" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected suggestion rest, got %v", rs.Suggestions)
	}
}

func TestSearch_PhraseAndLengthScoring(t *testing.T) {
	kbRoot := t.TempDir()
	os.MkdirAll(filepath.Join(kbRoot, workspace.KnowledgeBaseDir), 0755)

	// a: phrase in the title.
	// b: phrase only in the body of a short doc.
	// c: a long doc where only the single character "轮" appears many times.
	var longBody strings.Builder
	longBody.WriteString("# 长文档\n")
	for i := 0; i < 400; i++ {
		longBody.WriteString("这一轮讨论了很多内容。\n")
	}

	os.WriteFile(filepath.Join(kbRoot, "a.md"), []byte("# 复审第 7 轮记录\n\n短文档。"), 0644)
	os.WriteFile(filepath.Join(kbRoot, "b.md"), []byte("# 其他\n\n复审第 7 轮的结论。\n"), 0644)
	os.WriteFile(filepath.Join(kbRoot, "c.md"), []byte(longBody.String()), 0644)

	meta.SaveMeta(kbRoot, "a.md", &meta.DocumentMeta{Title: "复审第 7 轮记录", Summary: ""})
	meta.SaveMeta(kbRoot, "b.md", &meta.DocumentMeta{Title: "其他", Summary: ""})
	meta.SaveMeta(kbRoot, "c.md", &meta.DocumentMeta{Title: "长文档", Summary: ""})

	q, opts := BuildQueryForMode("复审第 7 轮", ModeFulltext, nil)
	rs, err := Search(kbRoot, q, opts)
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if len(rs.Results) < 3 {
		t.Fatalf("expected 3 results, got %d", len(rs.Results))
	}
	if rs.Results[0].RelPath != "a.md" {
		t.Fatalf("expected a.md (phrase in title) first, got %s", rs.Results[0].RelPath)
	}
	if rs.Results[1].RelPath != "b.md" {
		t.Fatalf("expected b.md (phrase in short body) second, got %s", rs.Results[1].RelPath)
	}
	if rs.Results[2].RelPath != "c.md" {
		t.Fatalf("expected c.md (long doc, single-char noise) last, got %s", rs.Results[2].RelPath)
	}
}
