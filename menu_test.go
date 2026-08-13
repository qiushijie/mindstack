package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"mindstack/internal/config"
)

// writeTestConfig writes a global config.json with the given knowledge base
// registry at the custom config path.
func writeTestConfig(t *testing.T, cfgPath string, kbs map[string]string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0755); err != nil {
		t.Fatal(err)
	}
	data, err := json.MarshalIndent(map[string]any{"knowledgeBases": kbs}, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(cfgPath, data, 0644); err != nil {
		t.Fatal(err)
	}
}

func TestListLocalKnowledgeBases(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	config.SetCustomConfigPath(cfgPath)
	t.Cleanup(func() { config.SetCustomConfigPath("") })

	kbA := filepath.Join(dir, "kb-a")
	kbB := filepath.Join(dir, "kb-b")
	for _, p := range []string{kbA, kbB} {
		if err := os.MkdirAll(p, 0755); err != nil {
			t.Fatal(err)
		}
	}
	// Register out of order and include a registry entry whose path no longer exists.
	writeTestConfig(t, cfgPath, map[string]string{
		"kb-b": kbB,
		"kb-a": kbA,
		"gone": filepath.Join(dir, "gone"),
	})

	entries := listLocalKnowledgeBases()

	if len(entries) != 2 {
		t.Fatalf("expected 2 entries, got %d: %+v", len(entries), entries)
	}
	if entries[0].Name != "kb-a" || entries[0].Path != kbA {
		t.Fatalf("expected first entry kb-a/%s, got %+v", kbA, entries[0])
	}
	if entries[1].Name != "kb-b" || entries[1].Path != kbB {
		t.Fatalf("expected second entry kb-b/%s, got %+v", kbB, entries[1])
	}
}

func TestListLocalKnowledgeBases_Empty(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	config.SetCustomConfigPath(cfgPath)
	t.Cleanup(func() { config.SetCustomConfigPath("") })

	writeTestConfig(t, cfgPath, map[string]string{})

	if entries := listLocalKnowledgeBases(); len(entries) != 0 {
		t.Fatalf("expected no entries, got %+v", entries)
	}
}

func TestListLocalKnowledgeBases_MissingConfig(t *testing.T) {
	dir := t.TempDir()
	config.SetCustomConfigPath(filepath.Join(dir, "config.json"))
	t.Cleanup(func() { config.SetCustomConfigPath("") })

	if entries := listLocalKnowledgeBases(); len(entries) != 0 {
		t.Fatalf("expected no entries without config, got %+v", entries)
	}
}
