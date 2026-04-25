package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestMoveToTrash(t *testing.T) {
	// Override HOME to a temp directory so we don't pollute the real trash.
	home := t.TempDir()
	t.Setenv("HOME", home)

	t.Run("move file to trash", func(t *testing.T) {
		srcDir := t.TempDir()
		srcFile := filepath.Join(srcDir, "testfile.md")
		if err := os.WriteFile(srcFile, []byte("hello"), 0644); err != nil {
			t.Fatalf("failed to create test file: %v", err)
		}

		if err := MoveToTrash(srcFile); err != nil {
			t.Fatalf("MoveToTrash failed: %v", err)
		}

		// Source file should no longer exist.
		if _, err := os.Stat(srcFile); !os.IsNotExist(err) {
			t.Fatal("source file should not exist after moving to trash")
		}

		// File should exist in trash.
		trashDir := getTrashDir(t, home)
		trashedFile := filepath.Join(trashDir, "testfile.md")
		if _, err := os.Stat(trashedFile); os.IsNotExist(err) {
			t.Fatalf("file should exist in trash at %s", trashedFile)
		}
	})

	t.Run("move directory to trash", func(t *testing.T) {
		srcDir := t.TempDir()
		nestedDir := filepath.Join(srcDir, "mydir")
		if err := os.MkdirAll(nestedDir, 0755); err != nil {
			t.Fatalf("failed to create test dir: %v", err)
		}
		nestedFile := filepath.Join(nestedDir, "inner.md")
		if err := os.WriteFile(nestedFile, []byte("content"), 0644); err != nil {
			t.Fatalf("failed to create inner file: %v", err)
		}

		if err := MoveToTrash(nestedDir); err != nil {
			t.Fatalf("MoveToTrash failed: %v", err)
		}

		if _, err := os.Stat(nestedDir); !os.IsNotExist(err) {
			t.Fatal("source dir should not exist after moving to trash")
		}

		trashDir := getTrashDir(t, home)
		trashedDir := filepath.Join(trashDir, "mydir")
		if _, err := os.Stat(trashedDir); os.IsNotExist(err) {
			t.Fatalf("dir should exist in trash at %s", trashedDir)
		}
	})

	t.Run("handle name collision", func(t *testing.T) {
		srcDir := t.TempDir()

		// First file
		srcFile1 := filepath.Join(srcDir, "collision.txt")
		if err := os.WriteFile(srcFile1, []byte("original"), 0644); err != nil {
			t.Fatalf("failed to create test file: %v", err)
		}
		if err := MoveToTrash(srcFile1); err != nil {
			t.Fatalf("first MoveToTrash failed: %v", err)
		}

		// Second file with same name
		srcFile2 := filepath.Join(srcDir, "collision.txt")
		if err := os.WriteFile(srcFile2, []byte("duplicate"), 0644); err != nil {
			t.Fatalf("failed to create second test file: %v", err)
		}
		if err := MoveToTrash(srcFile2); err != nil {
			t.Fatalf("second MoveToTrash failed: %v", err)
		}

		trashDir := getTrashDir(t, home)
		if _, err := os.Stat(filepath.Join(trashDir, "collision.txt")); os.IsNotExist(err) {
			t.Fatal("first trashed file should exist")
		}
		if _, err := os.Stat(filepath.Join(trashDir, "collision-1.txt")); os.IsNotExist(err) {
			t.Fatal("second trashed file should exist with suffix")
		}
	})

	t.Run("handle name collision without extension", func(t *testing.T) {
		srcDir := t.TempDir()

		srcFile1 := filepath.Join(srcDir, "README")
		if err := os.WriteFile(srcFile1, []byte("v1"), 0644); err != nil {
			t.Fatalf("failed to create test file: %v", err)
		}
		if err := MoveToTrash(srcFile1); err != nil {
			t.Fatalf("first MoveToTrash failed: %v", err)
		}

		srcFile2 := filepath.Join(srcDir, "README")
		if err := os.WriteFile(srcFile2, []byte("v2"), 0644); err != nil {
			t.Fatalf("failed to create second test file: %v", err)
		}
		if err := MoveToTrash(srcFile2); err != nil {
			t.Fatalf("second MoveToTrash failed: %v", err)
		}

		trashDir := getTrashDir(t, home)
		if _, err := os.Stat(filepath.Join(trashDir, "README")); os.IsNotExist(err) {
			t.Fatal("first trashed file should exist")
		}
		if _, err := os.Stat(filepath.Join(trashDir, "README-1")); os.IsNotExist(err) {
			t.Fatal("second trashed file should exist with suffix")
		}
	})

	t.Run("return error for non-existent file", func(t *testing.T) {
		err := MoveToTrash("/nonexistent/path/to/file.md")
		if err == nil {
			t.Fatal("expected error for non-existent file")
		}
	})

	if runtime.GOOS == "linux" {
		t.Run("create trashinfo on linux", func(t *testing.T) {
			srcDir := t.TempDir()
			srcFile := filepath.Join(srcDir, "linuxfile.md")
			if err := os.WriteFile(srcFile, []byte("linux"), 0644); err != nil {
				t.Fatalf("failed to create test file: %v", err)
			}

			if err := MoveToTrash(srcFile); err != nil {
				t.Fatalf("MoveToTrash failed: %v", err)
			}

			infoDir := filepath.Join(home, ".local", "share", "Trash", "info")
			infoFile := filepath.Join(infoDir, "linuxfile.md.trashinfo")
			data, err := os.ReadFile(infoFile)
			if err != nil {
				t.Fatalf("trashinfo file not created: %v", err)
			}
			content := string(data)
			if !strings.Contains(content, "[Trash Info]") {
				t.Fatal("trashinfo missing [Trash Info] header")
			}
			if !strings.Contains(content, "Path=") {
				t.Fatal("trashinfo missing Path field")
			}
			if !strings.Contains(content, "DeletionDate=") {
				t.Fatal("trashinfo missing DeletionDate field")
			}
		})
	}
}

func getTrashDir(t *testing.T, home string) string {
	t.Helper()
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, ".Trash")
	case "linux":
		return filepath.Join(home, ".local", "share", "Trash", "files")
	default:
		return os.TempDir()
	}
}
