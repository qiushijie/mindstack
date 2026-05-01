package relation

import (
	"os"
	"path/filepath"
	"testing"

	"mindstack/internal/workspace"
)

func TestLoadNonexistent(t *testing.T) {
	dir := t.TempDir()
	store, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(store) != 0 {
		t.Fatalf("expected empty store, got %d entries", len(store))
	}
}

func TestSaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	_ = os.MkdirAll(filepath.Join(dir, workspace.KnowledgeBaseDir), 0755)

	store := Store{
		"a.md": {
			{Source: "a.md", Target: "b.md", Score: 0.8, Reason: "related", SharedTags: []string{"go"}},
		},
	}
	if err := Save(dir, store); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if len(loaded) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(loaded))
	}
	rels := loaded["a.md"]
	if len(rels) != 1 || rels[0].Target != "b.md" {
		t.Fatalf("unexpected relations: %+v", rels)
	}
}

func TestRemoveByDoc(t *testing.T) {
	store := Store{
		"a.md": {
			{Source: "a.md", Target: "b.md", Score: 0.8},
			{Source: "a.md", Target: "c.md", Score: 0.5},
		},
		"b.md": {
			{Source: "b.md", Target: "a.md", Score: 0.8},
		},
		"c.md": {
			{Source: "c.md", Target: "d.md", Score: 0.3},
		},
	}

	RemoveByDoc(store, "a.md")

	if _, ok := store["a.md"]; ok {
		t.Fatal("a.md should be removed as source")
	}
	if _, ok := store["b.md"]; ok {
		t.Fatal("b.md should be removed (its target was a.md)")
	}
	if len(store["c.md"]) != 1 {
		t.Fatal("c.md relations should be untouched")
	}
}

func TestAddRelations(t *testing.T) {
	store := make(Store)
	relations := []Relation{
		{Source: "a.md", Target: "b.md", Score: 0.7},
		{Source: "a.md", Target: "c.md", Score: 0.5},
		{Source: "b.md", Target: "a.md", Score: 0.7},
	}
	AddRelations(store, relations)

	if len(store["a.md"]) != 2 {
		t.Fatalf("expected 2 relations for a.md, got %d", len(store["a.md"]))
	}
	if len(store["b.md"]) != 1 {
		t.Fatalf("expected 1 relation for b.md, got %d", len(store["b.md"]))
	}
}
