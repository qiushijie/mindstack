package meta

import (
	"os"
	"path/filepath"
	"testing"

	"mindstack/internal/workspace"
)

func setupTestKB(t *testing.T) string {
	t.Helper()
	kbRoot := t.TempDir()
	os.MkdirAll(filepath.Join(kbRoot, workspace.KnowledgeBaseDir), 0755)
	return kbRoot
}

func TestSaveAndLoadMeta(t *testing.T) {
	kbRoot := setupTestKB(t)

	original := &DocumentMeta{
		Title:   "Test Doc",
		Summary: "A test document",
		Tags:    []string{"test", "unit"},
		Status:  "active",
	}

	err := SaveMeta(kbRoot, "docs/test.md", original)
	if err != nil {
		t.Fatalf("save error: %v", err)
	}

	loaded, err := LoadMeta(kbRoot, "docs/test.md")
	if err != nil {
		t.Fatalf("load error: %v", err)
	}

	if loaded.Title != original.Title {
		t.Fatalf("expected title %s, got %s", original.Title, loaded.Title)
	}
	if loaded.Summary != original.Summary {
		t.Fatalf("expected summary %s, got %s", original.Summary, loaded.Summary)
	}
	if len(loaded.Tags) != 2 || loaded.Tags[0] != "test" {
		t.Fatalf("expected tags [test unit], got %v", loaded.Tags)
	}
	if loaded.Path != "docs/test.md" {
		t.Fatalf("expected path docs/test.md, got %s", loaded.Path)
	}
}

func TestSaveMeta_UpdatesExisting(t *testing.T) {
	kbRoot := setupTestKB(t)

	SaveMeta(kbRoot, "doc.md", &DocumentMeta{Title: "Old", Tags: []string{"old"}})
	SaveMeta(kbRoot, "doc.md", &DocumentMeta{Title: "New", Tags: []string{"new"}})

	loaded, err := LoadMeta(kbRoot, "doc.md")
	if err != nil {
		t.Fatalf("load error: %v", err)
	}
	if loaded.Title != "New" {
		t.Fatalf("expected title New, got %s", loaded.Title)
	}
}

func TestLoadMeta_NotFound(t *testing.T) {
	kbRoot := setupTestKB(t)

	_, err := LoadMeta(kbRoot, "nonexistent.md")
	if err == nil {
		t.Fatal("expected error for missing meta")
	}
}

func TestLoadMeta_EmptyStore(t *testing.T) {
	kbRoot := setupTestKB(t)
	// No meta.json file exists yet

	_, err := LoadMeta(kbRoot, "any.md")
	if err == nil {
		t.Fatal("expected error when meta file does not exist")
	}
}

func TestScanAll(t *testing.T) {
	kbRoot := setupTestKB(t)

	docs := []struct {
		path string
		meta *DocumentMeta
	}{
		{"api/rest.md", &DocumentMeta{Title: "REST API", Tags: []string{"api", "rest"}, Status: "active"}},
		{"api/graphql.md", &DocumentMeta{Title: "GraphQL", Tags: []string{"api", "graphql"}, Status: "active"}},
		{"design/principles.md", &DocumentMeta{Title: "Design Principles", Tags: []string{"design"}, Status: "active"}},
	}

	for _, d := range docs {
		SaveMeta(kbRoot, d.path, d.meta)
	}

	all, err := ScanAll(kbRoot, "")
	if err != nil {
		t.Fatalf("scan error: %v", err)
	}
	if len(all) != 3 {
		t.Fatalf("expected 3 metas, got %d", len(all))
	}
}

func TestScanAll_WithSubdir(t *testing.T) {
	kbRoot := setupTestKB(t)

	SaveMeta(kbRoot, "api/rest.md", &DocumentMeta{Title: "REST API", Tags: []string{"api"}, Status: "active"})
	SaveMeta(kbRoot, "design/principles.md", &DocumentMeta{Title: "Design", Tags: []string{"design"}, Status: "active"})

	apiOnly, err := ScanAll(kbRoot, "api")
	if err != nil {
		t.Fatalf("scan error: %v", err)
	}
	if len(apiOnly) != 1 {
		t.Fatalf("expected 1 meta in api subdir, got %d", len(apiOnly))
	}
	if apiOnly[0].Path != "api/rest.md" {
		t.Fatalf("expected api/rest.md, got %s", apiOnly[0].Path)
	}
}

func TestScanAll_EmptyStore(t *testing.T) {
	kbRoot := setupTestKB(t)

	all, err := ScanAll(kbRoot, "")
	if err != nil {
		t.Fatalf("scan error: %v", err)
	}
	if len(all) != 0 {
		t.Fatalf("expected 0 metas, got %d", len(all))
	}
}

func TestFindByTag(t *testing.T) {
	metas := []*DocumentMeta{
		{Path: "a.md", Tags: []string{"api", "rest"}},
		{Path: "b.md", Tags: []string{"api", "graphql"}},
		{Path: "c.md", Tags: []string{"design"}},
	}

	apiDocs := FindByTag(metas, "api", false)
	if len(apiDocs) != 2 {
		t.Fatalf("expected 2, got %d", len(apiDocs))
	}

	designDocs := FindByTag(metas, "design", false)
	if len(designDocs) != 1 {
		t.Fatalf("expected 1, got %d", len(designDocs))
	}

	none := FindByTag(metas, "nonexistent", false)
	if len(none) != 0 {
		t.Fatalf("expected 0, got %d", len(none))
	}
}

func TestFindByTag_MultipleTags(t *testing.T) {
	metas := []*DocumentMeta{
		{Path: "a.md", Tags: []string{"api", "rest"}},
		{Path: "b.md", Tags: []string{"api", "graphql"}},
		{Path: "c.md", Tags: []string{"design"}},
		{Path: "d.md", Tags: []string{}},
	}

	t.Run("and_semantics", func(t *testing.T) {
		docs := FindByTag(metas, "api,rest", false)
		if len(docs) != 1 {
			t.Fatalf("expected 1 (api AND rest), got %d", len(docs))
		}
	})

	t.Run("single_tag", func(t *testing.T) {
		docs := FindByTag(metas, "graphql", false)
		if len(docs) != 1 {
			t.Fatalf("expected 1, got %d", len(docs))
		}
	})

	t.Run("with_spaces", func(t *testing.T) {
		docs := FindByTag(metas, "api , graphql", false)
		if len(docs) != 1 {
			t.Fatalf("expected 1 (api AND graphql), got %d", len(docs))
		}
	})

	t.Run("no_match", func(t *testing.T) {
		docs := FindByTag(metas, "nonexistent1,nonexistent2", false)
		if len(docs) != 0 {
			t.Fatalf("expected 0, got %d", len(docs))
		}
	})

	t.Run("case_insensitive", func(t *testing.T) {
		docs := FindByTag(metas, "API,Rest", true)
		if len(docs) != 1 {
			t.Fatalf("expected 1 (case-insensitive api AND rest), got %d", len(docs))
		}
	})

	t.Run("empty_tags_returns_nil", func(t *testing.T) {
		docs := FindByTag(metas, " , ", false)
		if len(docs) != 0 {
			t.Fatalf("expected 0, got %d", len(docs))
		}
	})
}

func TestFindByTag_IgnoreCase(t *testing.T) {
	metas := []*DocumentMeta{
		{Path: "a.md", Tags: []string{"API"}},
	}

	result := FindByTag(metas, "api", true)
	if len(result) != 1 {
		t.Fatalf("expected 1 case-insensitive match, got %d", len(result))
	}
}

func TestFindByTag_MatchesAlias(t *testing.T) {
	metas := []*DocumentMeta{
		{Path: "a.md", Tags: []string{"unit-test"}, Aliases: []string{"test", "testing", "ut"}},
		{Path: "b.md", Tags: []string{"api"}, Aliases: []string{"restful"}},
		{Path: "c.md", Tags: []string{"design"}},
	}

	docs := FindByTag(metas, "test", false)
	if len(docs) != 1 {
		t.Fatalf("expected 1 (match via alias), got %d", len(docs))
	}
	if docs[0].Path != "a.md" {
		t.Fatalf("expected a.md, got %s", docs[0].Path)
	}

	restful := FindByTag(metas, "restful", false)
	if len(restful) != 1 {
		t.Fatalf("expected 1 (match via alias 'restful'), got %d", len(restful))
	}
}

func TestFindByTag_TagAndAliasCombined(t *testing.T) {
	metas := []*DocumentMeta{
		{Path: "a.md", Tags: []string{"unit-test"}, Aliases: []string{"test"}},
		{Path: "b.md", Tags: []string{"api", "unit-test"}, Aliases: []string{"restful"}},
	}

	// AND semantics: "unit-test" matches via Tags, "restful" matches via Aliases
	docs := FindByTag(metas, "unit-test,restful", false)
	if len(docs) != 1 {
		t.Fatalf("expected 1 (tag AND alias match), got %d", len(docs))
	}
	if docs[0].Path != "b.md" {
		t.Fatalf("expected b.md, got %s", docs[0].Path)
	}
}

func TestFindByTag_AliasIgnoreCase(t *testing.T) {
	metas := []*DocumentMeta{
		{Path: "a.md", Tags: []string{"unit-test"}, Aliases: []string{"UT"}},
	}

	result := FindByTag(metas, "ut", true)
	if len(result) != 1 {
		t.Fatalf("expected 1 case-insensitive alias match, got %d", len(result))
	}
}

func TestRemoveStale(t *testing.T) {
	kbRoot := setupTestKB(t)

	SaveMeta(kbRoot, "a.md", &DocumentMeta{Title: "A", Tags: []string{"test"}, Status: "active"})
	SaveMeta(kbRoot, "b.md", &DocumentMeta{Title: "B", Tags: []string{"test"}, Status: "active"})
	SaveMeta(kbRoot, "c.md", &DocumentMeta{Title: "C", Tags: []string{"test"}, Status: "active"})

	existing := map[string]bool{"a.md": true, "c.md": true}
	removed, err := RemoveStale(kbRoot, existing)
	if err != nil {
		t.Fatalf("RemoveStale error: %v", err)
	}
	if len(removed) != 1 || removed[0] != "b.md" {
		t.Fatalf("expected removed [b.md], got %v", removed)
	}

	// b.md should no longer be loadable
	if _, err := LoadMeta(kbRoot, "b.md"); err == nil {
		t.Fatal("b.md should be removed")
	}
	// a.md and c.md should still exist
	if _, err := LoadMeta(kbRoot, "a.md"); err != nil {
		t.Fatal("a.md should still exist")
	}
	if _, err := LoadMeta(kbRoot, "c.md"); err != nil {
		t.Fatal("c.md should still exist")
	}
}

func TestRemoveStale_NothingToRemove(t *testing.T) {
	kbRoot := setupTestKB(t)

	SaveMeta(kbRoot, "a.md", &DocumentMeta{Title: "A", Tags: []string{"test"}, Status: "active"})

	existing := map[string]bool{"a.md": true}
	removed, err := RemoveStale(kbRoot, existing)
	if err != nil {
		t.Fatalf("RemoveStale error: %v", err)
	}
	if len(removed) != 0 {
		t.Fatalf("expected no removals, got %v", removed)
	}
}

func TestRemoveStale_EmptyStore(t *testing.T) {
	kbRoot := setupTestKB(t)

	existing := map[string]bool{"a.md": true}
	removed, err := RemoveStale(kbRoot, existing)
	if err != nil {
		t.Fatalf("RemoveStale error: %v", err)
	}
	if len(removed) != 0 {
		t.Fatalf("expected no removals, got %v", removed)
	}
}

func TestMetaFilePath(t *testing.T) {
	expected := filepath.Join("/tmp/project", workspace.KnowledgeBaseDir, "meta.json")
	got := metaFilePath("/tmp/project")
	if got != expected {
		t.Fatalf("expected %s, got %s", expected, got)
	}
}
