package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.Version != "1" {
		t.Fatalf("expected version 1, got %s", cfg.Version)
	}
	if len(cfg.GetKnowledgeBases()) != 0 {
		t.Fatal("expected empty knowledge bases")
	}
	if !cfg.IsKnowledgeBase() {
		t.Fatal("expected IsKnowledgeBase true")
	}
}

func TestSaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")

	original := &Config{
		Name:           "test-kb",
		Description:    "test description",
		Version:        "1",
		KnowledgeBases: []string{"/path/to/kb"},
	}

	if err := SaveConfig(path, original); err != nil {
		t.Fatalf("save error: %v", err)
	}

	loaded, err := LoadConfig(path)
	if err != nil {
		t.Fatalf("load error: %v", err)
	}

	if loaded.Name != original.Name {
		t.Fatalf("expected name %s, got %s", original.Name, loaded.Name)
	}
	if len(loaded.KnowledgeBases) != 1 || loaded.KnowledgeBases[0] != "/path/to/kb" {
		t.Fatalf("expected knowledge_bases [/path/to/kb], got %v", loaded.KnowledgeBases)
	}
	if loaded.IsKnowledgeBase() {
		t.Fatal("expected IsKnowledgeBase false for linked config")
	}
}

func TestGetKnowledgeBases_Single(t *testing.T) {
	cfg := &Config{KnowledgeBase: "/path/to/kb"}
	kbs := cfg.GetKnowledgeBases()
	if len(kbs) != 1 || kbs[0] != "/path/to/kb" {
		t.Fatalf("expected [/path/to/kb], got %v", kbs)
	}
}

func TestGetKnowledgeBases_List(t *testing.T) {
	cfg := &Config{KnowledgeBases: []string{"/a", "/b"}}
	kbs := cfg.GetKnowledgeBases()
	if len(kbs) != 2 {
		t.Fatalf("expected 2, got %d", len(kbs))
	}
}

func TestGetKnowledgeBases_PreferList(t *testing.T) {
	cfg := &Config{
		KnowledgeBase:  "/old",
		KnowledgeBases: []string{"/new"},
	}
	kbs := cfg.GetKnowledgeBases()
	if len(kbs) != 1 || kbs[0] != "/new" {
		t.Fatalf("expected [/new] (list takes priority), got %v", kbs)
	}
}

func TestLoad_NonExistent(t *testing.T) {
	_, err := LoadConfig("/nonexistent/config.yaml")
	if err == nil {
		t.Fatal("expected error for non-existent file")
	}
}

func TestConfig_TooLarge(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")

	largeData := make([]byte, maxConfigSize+1)
	for i := range largeData {
		largeData[i] = 'x'
	}
	os.WriteFile(path, largeData, 0644)

	_, err := LoadConfig(path)
	if err == nil {
		t.Fatal("expected error for oversized config")
	}
}

// -------------------------------------------------------
// ConfigPath
// -------------------------------------------------------

func TestConfigPath_Default(t *testing.T) {
	// Ensure MINDSTACK_CONFIG_DIR is not set so we get the default path.
	os.Unsetenv("MINDSTACK_CONFIG_DIR")

	path := ConfigPath()
	if path == "" {
		t.Fatal("expected non-empty config path")
	}
	// Default path should end with mindstack/config.json
	if !filepath.IsAbs(path) {
		t.Fatalf("expected absolute path, got %s", path)
	}
	dir := filepath.Base(filepath.Dir(path))
	if dir != "mindstack" {
		t.Fatalf("expected parent dir 'mindstack', got %q", dir)
	}
	if filepath.Base(path) != "config.json" {
		t.Fatalf("expected filename 'config.json', got %q", filepath.Base(path))
	}
}

func TestConfigPath_EnvOverride(t *testing.T) {
	customDir := "/tmp/mindstack-test-cfg"
	os.Setenv("MINDSTACK_CONFIG_DIR", customDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	path := ConfigPath()
	expected := filepath.Join(customDir, "config.json")
	if path != expected {
		t.Fatalf("expected %s, got %s", expected, path)
	}
}

// -------------------------------------------------------
// ResolveConfigPath
// -------------------------------------------------------

func TestResolveConfigPath_Custom(t *testing.T) {
	// Reset state
	customConfigPath = ""

	SetCustomConfigPath("/custom/path/config.json")
	path := ResolveConfigPath()
	if path != "/custom/path/config.json" {
		t.Fatalf("expected /custom/path/config.json, got %s", path)
	}

	// Clean up
	SetCustomConfigPath("")
}

func TestResolveConfigPath_HomeDir(t *testing.T) {
	// Reset state
	customConfigPath = ""

	// Create a temporary home directory with .mindstack/config.json
	homeDir := t.TempDir()
	homeCfgDir := filepath.Join(homeDir, ".mindstack")
	os.MkdirAll(homeCfgDir, 0755)
	homeCfg := filepath.Join(homeCfgDir, "config.json")
	os.WriteFile(homeCfg, []byte("{}"), 0644)

	// Mock UserHomeDir
	origUserHomeDir := userHomeDir
	userHomeDir = func() (string, error) { return homeDir, nil }
	defer func() { userHomeDir = origUserHomeDir }()

	path := ResolveConfigPath()
	if path != homeCfg {
		t.Fatalf("expected %s, got %s", homeCfg, path)
	}
}

func TestResolveConfigPath_Fallback(t *testing.T) {
	// Reset state
	customConfigPath = ""

	// Ensure no ~/.mindstack/config.json interferes
	origUserHomeDir := userHomeDir
	userHomeDir = func() (string, error) { return "/nonexistent-home", nil }
	defer func() { userHomeDir = origUserHomeDir }()

	path := ResolveConfigPath()
	expected := ConfigPath()
	if path != expected {
		t.Fatalf("expected %s (ConfigPath fallback), got %s", expected, path)
	}
}

func TestResolveConfigPath_CustomTakesPriority(t *testing.T) {
	// Custom path should win even when home dir config exists
	SetCustomConfigPath("/custom/config.json")

	homeDir := t.TempDir()
	homeCfg := filepath.Join(homeDir, ".mindstack", "config.json")
	os.MkdirAll(filepath.Dir(homeCfg), 0755)
	os.WriteFile(homeCfg, []byte("{}"), 0644)

	origUserHomeDir := userHomeDir
	userHomeDir = func() (string, error) { return homeDir, nil }
	defer func() { userHomeDir = origUserHomeDir }()

	path := ResolveConfigPath()
	if path != "/custom/config.json" {
		t.Fatalf("expected custom path /custom/config.json, got %s", path)
	}

	SetCustomConfigPath("")
}

// -------------------------------------------------------
// configError.Error
// -------------------------------------------------------

func TestConfigError_Error(t *testing.T) {
	err := errConfigTooLarge
	msg := err.Error()
	if msg != "config file exceeds 64KB limit" {
		t.Fatalf("unexpected error message: %q", msg)
	}
}
