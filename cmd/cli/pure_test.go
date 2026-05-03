package main

import (
	"path/filepath"
	"testing"

	"mindstack/internal/workspace"
)

func TestKbNames(t *testing.T) {
	kbs := []workspace.KBInfo{
		{Name: "kb1", Path: "/path/1"},
		{Name: "kb2", Path: "/path/2"},
	}
	names := kbNames(kbs)
	if len(names) != 2 || names[0] != "kb1" || names[1] != "kb2" {
		t.Errorf("kbNames() = %v, want [kb1 kb2]", names)
	}

	empty := kbNames(nil)
	if len(empty) != 0 {
		t.Errorf("kbNames(nil) = %v, want empty", empty)
	}
}

func TestValidatePathSafe(t *testing.T) {
	root := "/Users/test/workspace"

	tests := []struct {
		name    string
		target  string
		wantErr bool
	}{
		{"valid file", filepath.Join(root, "notes/test.md"), false},
		{"valid root itself", root, false},
		{"path escape", filepath.Join(root, "../etc/passwd"), true},
		{"relative path rejected", "notes/test.md", true},
		{"deep subdirectory", filepath.Join(root, "a/b/c/d.md"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validatePathSafe(root, tt.target)
			if (err != nil) != tt.wantErr {
				t.Errorf("validatePathSafe(%q) err = %v, wantErr %v", tt.target, err, tt.wantErr)
			}
		})
	}
}
