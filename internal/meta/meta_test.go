package meta

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
		Title:     "Test Doc",
		Summary:   "A test document",
		Tags:      []string{"test", "unit"},
		Status:    "active",
		Keywords:  []string{"unit testing", "mock"},
		Aliases:   []string{"UT"},
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
	if len(loaded.Keywords) != 2 || loaded.Keywords[0] != "unit testing" {
		t.Fatalf("expected keywords [unit testing mock], got %v", loaded.Keywords)
	}
	if len(loaded.Aliases) != 1 || loaded.Aliases[0] != "UT" {
		t.Fatalf("expected aliases [UT], got %v", loaded.Aliases)
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

func TestLoadMeta_MissingKeywordsAndAliases(t *testing.T) {
	kbRoot := setupTestKB(t)

	// Simulate an old meta.json that predates keywords and aliases.
	oldJSON := `{"doc.md":{"title":"Old Doc","summary":"legacy","tags":["legacy"],"status":"active"}}`
	metaDir := filepath.Join(kbRoot, workspace.KnowledgeBaseDir)
	os.MkdirAll(metaDir, 0755)
	os.WriteFile(filepath.Join(metaDir, "meta.json"), []byte(oldJSON), 0644)

	loaded, err := LoadMeta(kbRoot, "doc.md")
	if err != nil {
		t.Fatalf("unexpected error loading legacy meta: %v", err)
	}
	if loaded.Title != "Old Doc" {
		t.Fatalf("expected title Old Doc, got %s", loaded.Title)
	}
	if loaded.Keywords != nil {
		t.Fatalf("expected nil keywords for legacy meta, got %v", loaded.Keywords)
	}
	if loaded.Aliases != nil {
		t.Fatalf("expected nil aliases for legacy meta, got %v", loaded.Aliases)
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

func TestScanAll_SkipsInvalidPaths(t *testing.T) {
	kbRoot := setupTestKB(t)

	// Seed a normal entry and several malicious/corrupted entries.
	SaveMeta(kbRoot, "docs/valid.md", &DocumentMeta{Title: "Valid", Tags: []string{"valid"}, Status: "active"})

	maliciousJSON := `{
		"docs/valid.md": {"title":"Valid","tags":["valid"],"status":"active"},
		"../secret.md": {"title":"Secret","tags":["secret"],"status":"active"},
		"/etc/passwd": {"title":"Passwd","tags":["system"],"status":"active"},
		"": {"title":"Empty","tags":["empty"],"status":"active"},
		".": {"title":"Dot","tags":["dot"],"status":"active"},
		"docs": {"title":"Dir","tags":["dir"],"status":"active"},
		"dir/": {"title":"DirSlash","tags":["dirslash"],"status":"active"},
		"config.yaml": {"title":"Config","tags":["config"],"status":"active"}
	}`
	metaDir := filepath.Join(kbRoot, workspace.KnowledgeBaseDir)
	os.WriteFile(filepath.Join(metaDir, "meta.json"), []byte(maliciousJSON), 0644)

	all, err := ScanAll(kbRoot, "")
	if err != nil {
		t.Fatalf("scan error: %v", err)
	}
	if len(all) != 1 {
		t.Fatalf("expected only valid entry, got %d", len(all))
	}
	if all[0].Path != "docs/valid.md" {
		t.Fatalf("expected docs/valid.md, got %s", all[0].Path)
	}
}

func TestLoadMeta_InvalidPath(t *testing.T) {
	kbRoot := setupTestKB(t)

	invalidPaths := []string{"../secret.md", "/etc/passwd", ""}
	for _, p := range invalidPaths {
		_, err := LoadMeta(kbRoot, p)
		if err == nil {
			t.Fatalf("expected error for invalid path %q", p)
		}
	}
}

func TestSaveMeta_InvalidPath(t *testing.T) {
	kbRoot := setupTestKB(t)

	invalidPaths := []string{"../secret.md", "/etc/passwd", ""}
	for _, p := range invalidPaths {
		err := SaveMeta(kbRoot, p, &DocumentMeta{Title: "Bad", Tags: []string{"bad"}, Status: "active"})
		if err == nil {
			t.Fatalf("expected error for invalid path %q", p)
		}
	}
}

func TestLoadAll_MetaFileTooLarge(t *testing.T) {
	kbRoot := setupTestKB(t)

	oversized := make([]byte, maxMetaSize+1)
	for i := range oversized {
		oversized[i] = 'x'
	}
	path := filepath.Join(kbRoot, workspace.KnowledgeBaseDir, "meta.json")
	if err := os.WriteFile(path, oversized, 0644); err != nil {
		t.Fatalf("write oversized meta file: %v", err)
	}

	_, err := LoadMeta(kbRoot, "docs/test.md")
	if err == nil {
		t.Fatal("expected error for oversized meta file")
	}
	if !strings.Contains(err.Error(), "too large") {
		t.Fatalf("expected 'too large' error, got: %v", err)
	}
	if !strings.Contains(err.Error(), path) {
		t.Fatalf("expected path in error, got: %v", err)
	}
	if !strings.Contains(err.Error(), fmt.Sprintf("%d bytes exceeds %d byte limit", maxMetaSize+1, maxMetaSize)) {
		t.Fatalf("expected actual size and limit in error, got: %v", err)
	}
}
