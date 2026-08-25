package meta

import (
	"fmt"
	"sync"
	"testing"
)

func TestOpenStore_Empty(t *testing.T) {
	kbRoot := setupTestKB(t)

	store, err := OpenStore(kbRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if got := store.Get("docs/missing.md"); got != nil {
		t.Fatalf("expected nil for missing entry, got %+v", got)
	}
}

func TestStore_SetGetSave(t *testing.T) {
	kbRoot := setupTestKB(t)

	store, err := OpenStore(kbRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	if err := store.Set("docs/a.md", &DocumentMeta{
		Title:  "Doc A",
		Tags:   []string{"go"},
		Status: "active",
	}); err != nil {
		t.Fatalf("set a.md: %v", err)
	}
	if err := store.Set("docs/b.md", &DocumentMeta{
		Title:  "Doc B",
		Tags:   []string{"cli"},
		Status: "active",
	}); err != nil {
		t.Fatalf("set b.md: %v", err)
	}

	got := store.Get("docs/a.md")
	if got == nil {
		t.Fatal("expected entry for docs/a.md")
	}
	if got.Title != "Doc A" {
		t.Fatalf("expected title 'Doc A', got %q", got.Title)
	}
	if got.Path != "docs/a.md" {
		t.Fatalf("expected path docs/a.md, got %q", got.Path)
	}

	if err := store.Save(); err != nil {
		t.Fatalf("save: %v", err)
	}

	// The data must be readable through the regular single-doc API.
	loaded, err := LoadMeta(kbRoot, "docs/b.md")
	if err != nil {
		t.Fatalf("load b.md after save: %v", err)
	}
	if loaded.Title != "Doc B" {
		t.Fatalf("expected title 'Doc B', got %q", loaded.Title)
	}
}

func TestStore_LoadsExistingEntries(t *testing.T) {
	kbRoot := setupTestKB(t)

	if err := SaveMeta(kbRoot, "docs/existing.md", &DocumentMeta{
		Title:  "Existing",
		Status: "active",
	}); err != nil {
		t.Fatalf("save existing meta: %v", err)
	}

	store, err := OpenStore(kbRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	got := store.Get("docs/existing.md")
	if got == nil {
		t.Fatal("expected existing entry to be loaded")
	}
	if got.Title != "Existing" {
		t.Fatalf("expected title 'Existing', got %q", got.Title)
	}
}

func TestStore_SetInvalidPath(t *testing.T) {
	kbRoot := setupTestKB(t)

	store, err := OpenStore(kbRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if err := store.Set("../escape.md", &DocumentMeta{Title: "X"}); err == nil {
		t.Fatal("expected error for escaping path")
	}
	if err := store.Set("not-markdown.txt", &DocumentMeta{Title: "X"}); err == nil {
		t.Fatal("expected error for non-markdown path")
	}
}

func TestStore_GetInvalidPath(t *testing.T) {
	kbRoot := setupTestKB(t)

	store, err := OpenStore(kbRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if got := store.Get("../escape.md"); got != nil {
		t.Fatalf("expected nil for invalid path, got %+v", got)
	}
}

func TestStore_ConcurrentSet(t *testing.T) {
	kbRoot := setupTestKB(t)

	store, err := OpenStore(kbRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	const n = 32
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			path := fmt.Sprintf("docs/doc-%02d.md", i)
			if err := store.Set(path, &DocumentMeta{Title: path, Status: "active"}); err != nil {
				t.Errorf("set %s: %v", path, err)
			}
			_ = store.Get(path)
		}(i)
	}
	wg.Wait()

	if err := store.Save(); err != nil {
		t.Fatalf("save: %v", err)
	}

	all, err := ScanAll(kbRoot, "")
	if err != nil {
		t.Fatalf("scan all: %v", err)
	}
	if len(all) != n {
		t.Fatalf("expected %d entries, got %d", n, len(all))
	}
}

func TestStore_GetReturnsIsolatedCopy(t *testing.T) {
	kbRoot := setupTestKB(t)

	store, err := OpenStore(kbRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	if err := store.Set("docs/a.md", &DocumentMeta{
		Title:    "Doc A",
		Tags:     []string{"go", "cli"},
		Headings: []Heading{{Level: 1, Text: "Intro"}},
		Keywords: []string{"golang"},
		Aliases:  []string{"gopher"},
		Status:   "active",
	}); err != nil {
		t.Fatalf("set: %v", err)
	}

	got := store.Get("docs/a.md")
	if got == nil {
		t.Fatal("expected entry for docs/a.md")
	}

	// Mutating the returned copy (including slice fields) must not leak into
	// the store.
	got.Tags[0] = "mutated"
	got.Headings[0].Text = "mutated"
	got.Keywords[0] = "mutated"
	got.Aliases[0] = "mutated"
	got.Title = "mutated"

	fresh := store.Get("docs/a.md")
	if fresh.Title != "Doc A" {
		t.Fatalf("title leaked into store: %q", fresh.Title)
	}
	if fresh.Tags[0] != "go" {
		t.Fatalf("tags leaked into store: %v", fresh.Tags)
	}
	if fresh.Headings[0].Text != "Intro" {
		t.Fatalf("headings leaked into store: %v", fresh.Headings)
	}
	if fresh.Keywords[0] != "golang" {
		t.Fatalf("keywords leaked into store: %v", fresh.Keywords)
	}
	if fresh.Aliases[0] != "gopher" {
		t.Fatalf("aliases leaked into store: %v", fresh.Aliases)
	}
}

// TestStore_ConcurrentSetAndSave exercises Set and Save from multiple
// goroutines; run with -race to catch data races.
func TestStore_ConcurrentSetAndSave(t *testing.T) {
	kbRoot := setupTestKB(t)

	store, err := OpenStore(kbRoot)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}

	const n = 16
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(2)
		go func(i int) {
			defer wg.Done()
			path := fmt.Sprintf("docs/doc-%02d.md", i)
			if err := store.Set(path, &DocumentMeta{Title: path, Status: "active"}); err != nil {
				t.Errorf("set %s: %v", path, err)
			}
		}(i)
		go func() {
			defer wg.Done()
			if err := store.Save(); err != nil {
				t.Errorf("save: %v", err)
			}
		}()
	}
	wg.Wait()

	if err := store.Save(); err != nil {
		t.Fatalf("final save: %v", err)
	}
	all, err := ScanAll(kbRoot, "")
	if err != nil {
		t.Fatalf("scan all: %v", err)
	}
	if len(all) != n {
		t.Fatalf("expected %d entries, got %d", n, len(all))
	}
}
