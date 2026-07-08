package retrieval

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

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

func TestSearch_DefaultTagModeIsAND(t *testing.T) {
	kbRoot := setupTestKB(t)

	// No document has both "rest" and "architecture". With the default (empty)
	// TagMode, the query should behave like TagModeAND and return no results.
	rs, err := Search(kbRoot, Query{Raw: "rest,architecture", Tags: []string{"rest", "architecture"}}, Options{Mode: ModeTag})
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if rs.Total != 0 {
		t.Fatalf("expected 0 results with default AND semantics, got %d", rs.Total)
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
	if rs.Total != 1 {
		t.Fatalf("expected 1 result due to limit, got %d", rs.Total)
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
