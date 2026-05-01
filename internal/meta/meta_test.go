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

func TestFindByTag_IgnoreCase(t *testing.T) {
	metas := []*DocumentMeta{
		{Path: "a.md", Tags: []string{"API"}},
	}

	result := FindByTag(metas, "api", true)
	if len(result) != 1 {
		t.Fatalf("expected 1 case-insensitive match, got %d", len(result))
	}
}

func TestMetaFilePath(t *testing.T) {
	expected := filepath.Join("/tmp/project", workspace.KnowledgeBaseDir, "meta.json")
	got := metaFilePath("/tmp/project")
	if got != expected {
		t.Fatalf("expected %s, got %s", expected, got)
	}
}
