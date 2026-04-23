package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadDirEntries(t *testing.T) {
	app := NewApp()

	t.Run("normal directory", func(t *testing.T) {
		dir := t.TempDir()
		createFile(t, dir, "alpha.md", "# Alpha")
		createFile(t, dir, "beta.md", "# Beta")
		createFile(t, dir, ".hidden.md", "# Hidden")
		createFile(t, dir, "readme.txt", "readme")
		createDir(t, dir, "subdir")
		createDir(t, dir, ".hiddenDir")

		entries := app.ReadDirEntries(dir)

		if len(entries) != 3 {
			t.Fatalf("expected 3 entries, got %d", len(entries))
		}

		// directories first, then files sorted by name
		assertEntry(t, entries[0], "subdir", filepath.Join(dir, "subdir"), true)
		assertEntry(t, entries[1], "alpha.md", filepath.Join(dir, "alpha.md"), false)
		assertEntry(t, entries[2], "beta.md", filepath.Join(dir, "beta.md"), false)
	})

	t.Run("empty directory", func(t *testing.T) {
		dir := t.TempDir()

		entries := app.ReadDirEntries(dir)

		if entries != nil {
			t.Fatalf("expected nil for empty directory, got %v", entries)
		}
	})

	t.Run("non-existent directory", func(t *testing.T) {
		entries := app.ReadDirEntries("/non/existent/path")

		if entries != nil {
			t.Fatalf("expected nil for non-existent directory, got %v", entries)
		}
	})
}

func TestReadFileContent(t *testing.T) {
	app := NewApp()

	t.Run("normal file", func(t *testing.T) {
		dir := t.TempDir()
		fp := filepath.Join(dir, "test.md")
		content := "# Hello World"
		createFile(t, dir, "test.md", content)

		result := app.ReadFileContent(fp)

		if result != content {
			t.Fatalf("expected %q, got %q", content, result)
		}
	})

	t.Run("non-existent file", func(t *testing.T) {
		result := app.ReadFileContent("/non/existent/file.md")

		if result != "" {
			t.Fatalf("expected empty string for non-existent file, got %q", result)
		}
	})
}

func TestSaveFileContent(t *testing.T) {
	app := NewApp()

	t.Run("normal save", func(t *testing.T) {
		dir := t.TempDir()
		fp := filepath.Join(dir, "test.md")
		content := "# Saved Content"

		result := app.SaveFileContent(fp, content)

		if result != "" {
			t.Fatalf("expected empty string on success, got %q", result)
		}

		data, err := os.ReadFile(fp)
		if err != nil {
			t.Fatalf("failed to read saved file: %v", err)
		}
		if string(data) != content {
			t.Fatalf("expected file content %q, got %q", content, string(data))
		}
	})

	t.Run("save to non-existent directory", func(t *testing.T) {
		dir := t.TempDir()
		fp := filepath.Join(dir, "nested", "deep", "test.md")
		content := "# Nested Save"

		result := app.SaveFileContent(fp, content)

		if result != "" {
			t.Fatalf("expected empty string on success, got %q", result)
		}

		data, err := os.ReadFile(fp)
		if err != nil {
			t.Fatalf("failed to read saved file: %v", err)
		}
		if string(data) != content {
			t.Fatalf("expected file content %q, got %q", content, string(data))
		}
	})

	t.Run("save to read-only directory", func(t *testing.T) {
		dir := t.TempDir()
		readOnlyDir := filepath.Join(dir, "readonly")
		if err := os.Mkdir(readOnlyDir, 0555); err != nil {
			t.Fatalf("failed to create read-only dir: %v", err)
		}
		fp := filepath.Join(readOnlyDir, "test.md")

		result := app.SaveFileContent(fp, "content")

		if result == "" {
			t.Fatal("expected error when saving to read-only directory, got success")
		}
	})
}

func assertEntry(t *testing.T, entry FileEntry, expectedName, expectedPath string, expectedIsDir bool) {
	t.Helper()
	if entry.Name != expectedName {
		t.Errorf("expected name %q, got %q", expectedName, entry.Name)
	}
	if entry.Path != expectedPath {
		t.Errorf("expected path %q, got %q", expectedPath, entry.Path)
	}
	if entry.IsDir != expectedIsDir {
		t.Errorf("expected IsDir %v, got %v", expectedIsDir, entry.IsDir)
	}
}

func createFile(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
		t.Fatalf("failed to create file %s: %v", name, err)
	}
}

func createDir(t *testing.T, parent, name string) {
	t.Helper()
	if err := os.Mkdir(filepath.Join(parent, name), 0755); err != nil {
		t.Fatalf("failed to create directory %s: %v", name, err)
	}
}
