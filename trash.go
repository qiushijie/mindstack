package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// MoveToTrash moves a file or directory to the system trash.
// It handles name collisions by appending a numeric suffix.
func MoveToTrash(filePath string) error {
	info, err := os.Stat(filePath)
	if err != nil {
		return err
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	var trashDir string
	switch runtime.GOOS {
	case "darwin":
		trashDir = filepath.Join(home, ".Trash")
	case "linux":
		trashDir = filepath.Join(home, ".local", "share", "Trash", "files")
		// Ensure trash directories exist on Linux
		infoDir := filepath.Join(home, ".local", "share", "Trash", "info")
		os.MkdirAll(trashDir, 0755)
		os.MkdirAll(infoDir, 0755)
	default:
		// Fallback: rename to a temp location with timestamp
		trashDir = os.TempDir()
	}

	// macOS trash dir might not exist
	if runtime.GOOS == "darwin" {
		os.MkdirAll(trashDir, 0755)
	}

	name := info.Name()
	target := filepath.Join(trashDir, name)

	// Handle name collisions
	if _, err := os.Stat(target); err == nil {
		ext := filepath.Ext(name)
		base := name[:len(name)-len(ext)]
		if ext == "" {
			base = name
		}
		for i := 1; ; i++ {
			candidate := fmt.Sprintf("%s-%d%s", base, i, ext)
			target = filepath.Join(trashDir, candidate)
			if _, err := os.Stat(target); os.IsNotExist(err) {
				break
			}
		}
	}

	if runtime.GOOS == "linux" {
		// Write .trashinfo file for Linux desktop integration
		infoDir := filepath.Join(home, ".local", "share", "Trash", "info")
		trashInfoName := filepath.Base(target) + ".trashinfo"
		trashInfoPath := filepath.Join(infoDir, trashInfoName)
		deletionDate := info.ModTime().Format("2006-01-02T15:04:05")
		trashInfoContent := fmt.Sprintf(
			"[Trash Info]\nPath=%s\nDeletionDate=%s\n",
			filePath, deletionDate,
		)
		os.WriteFile(trashInfoPath, []byte(trashInfoContent), 0644)
	}

	return os.Rename(filePath, target)
}
