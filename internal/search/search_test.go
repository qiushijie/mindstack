package search

import (
	"os"
	"path/filepath"
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

	os.WriteFile(filepath.Join(kbRoot, "api-specs", "rest-api.md"), []byte(`# REST API`), 0644)
	os.WriteFile(filepath.Join(kbRoot, "adr", "001-database.md"), []byte(`# ADR-001 Database Selection`), 0644)

	meta.SaveMeta(kbRoot, "api-specs/rest-api.md", &meta.DocumentMeta{
		Title: "REST API", Tags: []string{"api-spec", "rest", "frontend", "backend"}, Status: "active",
	})
	meta.SaveMeta(kbRoot, "adr/001-database.md", &meta.DocumentMeta{
		Title: "ADR-001 Database Selection", Tags: []string{"architecture", "adr", "database"}, Status: "active",
	})

	return kbRoot
}

func TestSearchByTag_SingleMatch(t *testing.T) {
	kbRoot := setupTestKB(t)

	result, err := SearchByTag(kbRoot, "api-spec", "", false)
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if result.Total != 1 {
		t.Fatalf("expected 1, got %d", result.Total)
	}
	if result.Items[0].Path != "api-specs/rest-api.md" {
		t.Fatalf("expected api-specs/rest-api.md, got %s", result.Items[0].Path)
	}
}

func TestSearchByTag_MultipleMatch(t *testing.T) {
	kbRoot := setupTestKB(t)

	result, err := SearchByTag(kbRoot, "rest", "", false)
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if result.Total != 1 {
		t.Fatalf("expected 1, got %d", result.Total)
	}
}

func TestSearchByTag_NoMatch(t *testing.T) {
	kbRoot := setupTestKB(t)

	result, err := SearchByTag(kbRoot, "nonexistent", "", false)
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if result.Total != 0 {
		t.Fatalf("expected 0, got %d", result.Total)
	}
}


