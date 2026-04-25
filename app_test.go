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

func TestFileExists(t *testing.T) {
	app := NewApp()

	t.Run("existing file", func(t *testing.T) {
		dir := t.TempDir()
		fp := filepath.Join(dir, "exists.md")
		createFile(t, dir, "exists.md", "content")

		if !app.FileExists(fp) {
			t.Fatal("expected FileExists to return true for existing file")
		}
	})

	t.Run("existing directory", func(t *testing.T) {
		dir := t.TempDir()
		subDir := filepath.Join(dir, "subdir")
		createDir(t, dir, "subdir")

		if !app.FileExists(subDir) {
			t.Fatal("expected FileExists to return true for existing directory")
		}
	})

	t.Run("non-existent path", func(t *testing.T) {
		if app.FileExists("/non/existent/file.md") {
			t.Fatal("expected FileExists to return false for non-existent path")
		}
	})
}

func TestDeleteFile(t *testing.T) {
	app := NewApp()
	// Override HOME to avoid polluting the real trash.
	home := t.TempDir()
	t.Setenv("HOME", home)

	t.Run("delete existing file", func(t *testing.T) {
		dir := t.TempDir()
		fp := filepath.Join(dir, "delete-me.md")
		createFile(t, dir, "delete-me.md", "bye")

		err := app.DeleteFile(fp)
		if err != nil {
			t.Fatalf("DeleteFile failed: %v", err)
		}

		if _, err := os.Stat(fp); !os.IsNotExist(err) {
			t.Fatal("file should not exist after deletion")
		}
	})

	t.Run("delete existing directory", func(t *testing.T) {
		dir := t.TempDir()
		subDir := filepath.Join(dir, "delete-dir")
		createDir(t, dir, "delete-dir")
		createFile(t, subDir, "inner.md", "content")

		err := app.DeleteFile(subDir)
		if err != nil {
			t.Fatalf("DeleteFile failed: %v", err)
		}

		if _, err := os.Stat(subDir); !os.IsNotExist(err) {
			t.Fatal("directory should not exist after deletion")
		}
	})

	t.Run("return error for non-existent path", func(t *testing.T) {
		err := app.DeleteFile("/non/existent/path")
		if err == nil {
			t.Fatal("expected error when deleting non-existent path")
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

func TestConfirmDelete(t *testing.T) {
	app := NewApp()

	// ConfirmDelete calls runtime.MessageDialog which requires a valid Wails
	// context. In unit tests the context is nil, so the call panics.
	// We verify the method exists and has the expected signature by checking
	// that it is a bound method on *App.
	_ = app.ConfirmDelete
}

func TestClipboardSetText(t *testing.T) {
	app := NewApp()

	// ClipboardSetText calls runtime.ClipboardSetText which requires a valid
	// Wails context. In unit tests the context is nil, so the call panics.
	// We verify the method exists and has the expected signature.
	_ = app.ClipboardSetText
}

func TestClipboardGetText(t *testing.T) {
	app := NewApp()

	// ClipboardGetText calls runtime.ClipboardGetText which requires a valid
	// Wails context. In unit tests the context is nil, so the call panics.
	// We verify the method exists and has the expected signature.
	_ = app.ClipboardGetText
}
