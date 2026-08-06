package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
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
}

func TestSaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")

	original := &Config{
		Name:           "test-kb",
		Description:    "test description",
		Version:        "1",
		KnowledgeBases: []string{"shared-docs"},
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
	if len(loaded.KnowledgeBases) != 1 || loaded.KnowledgeBases[0] != "shared-docs" {
		t.Fatalf("expected knowledge_bases [shared-docs], got %v", loaded.KnowledgeBases)
	}
}

func TestGetKnowledgeBases_List(t *testing.T) {
	cfg := &Config{KnowledgeBases: []string{"kb-a", "kb-b"}}
	kbs := cfg.GetKnowledgeBases()
	if len(kbs) != 2 {
		t.Fatalf("expected 2, got %d", len(kbs))
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

// -------------------------------------------------------
// KB registry (global config.json)
// -------------------------------------------------------

// useRegistry isolates the global KB registry to a temp config file.
func useRegistry(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.json")
	SetCustomConfigPath(path)
	t.Cleanup(func() { SetCustomConfigPath("") })
	return path
}

func TestRegisterAndResolveKnowledgeBase(t *testing.T) {
	useRegistry(t)

	if err := RegisterKnowledgeBase("docs", "/tmp/docs-kb"); err != nil {
		t.Fatalf("register error: %v", err)
	}

	path, err := ResolveKnowledgeBasePath("docs")
	if err != nil {
		t.Fatalf("resolve error: %v", err)
	}
	if path != "/tmp/docs-kb" {
		t.Fatalf("expected /tmp/docs-kb, got %s", path)
	}
}

func TestResolveKnowledgeBasePath_NotRegistered(t *testing.T) {
	useRegistry(t)

	_, err := ResolveKnowledgeBasePath("missing")
	if err == nil {
		t.Fatal("expected error for unregistered name")
	}
	if !strings.Contains(err.Error(), "mindstack link") {
		t.Fatalf("expected 'mindstack link' hint in error, got: %v", err)
	}
}

func TestRegisterKnowledgeBase_NameConflict(t *testing.T) {
	useRegistry(t)

	if err := RegisterKnowledgeBase("docs", "/path/a"); err != nil {
		t.Fatalf("register error: %v", err)
	}

	// Re-registering the same name to the same path is idempotent.
	if err := RegisterKnowledgeBase("docs", "/path/a"); err != nil {
		t.Fatalf("re-register same path should succeed: %v", err)
	}

	err := RegisterKnowledgeBase("docs", "/path/b")
	if err == nil {
		t.Fatal("expected conflict error")
	}
	var conflict *NameConflictError
	if !errors.As(err, &conflict) {
		t.Fatalf("expected NameConflictError, got %T: %v", err, err)
	}
	if conflict.Name != "docs" || conflict.ExistingPath != "/path/a" {
		t.Fatalf("unexpected conflict details: %+v", conflict)
	}
}

func TestRegisterKnowledgeBase_EmptyArgs(t *testing.T) {
	useRegistry(t)

	for _, tc := range []struct {
		name string
		path string
	}{
		{name: "", path: "/tmp/docs-kb"},
		{name: "docs", path: ""},
		{name: "", path: ""},
	} {
		if err := RegisterKnowledgeBase(tc.name, tc.path); err == nil {
			t.Fatalf("expected error for name=%q path=%q", tc.name, tc.path)
		}
	}

	kbs, err := ListKnowledgeBases()
	if err != nil {
		t.Fatalf("list error: %v", err)
	}
	if len(kbs) != 0 {
		t.Fatalf("expected empty registry after rejected registrations, got %v", kbs)
	}
}

func TestListKnowledgeBases(t *testing.T) {
	useRegistry(t)

	if err := RegisterKnowledgeBase("kb-a", "/path/a"); err != nil {
		t.Fatalf("register error: %v", err)
	}
	if err := RegisterKnowledgeBase("kb-b", "/path/b"); err != nil {
		t.Fatalf("register error: %v", err)
	}

	kbs, err := ListKnowledgeBases()
	if err != nil {
		t.Fatalf("list error: %v", err)
	}
	if len(kbs) != 2 || kbs["kb-a"] != "/path/a" || kbs["kb-b"] != "/path/b" {
		t.Fatalf("unexpected registry: %v", kbs)
	}
}

func TestListKnowledgeBases_Empty(t *testing.T) {
	useRegistry(t)

	kbs, err := ListKnowledgeBases()
	if err != nil {
		t.Fatalf("list error: %v", err)
	}
	if len(kbs) != 0 {
		t.Fatalf("expected empty registry, got %v", kbs)
	}
}

func TestRegisterKnowledgeBase_PreservesOtherFields(t *testing.T) {
	cfgPath := useRegistry(t)

	original := `{"settings": {"theme": "dark"}, "recentEntries": ["/x"]}`
	if err := os.WriteFile(cfgPath, []byte(original), 0644); err != nil {
		t.Fatal(err)
	}

	if err := RegisterKnowledgeBase("docs", "/tmp/docs-kb"); err != nil {
		t.Fatalf("register error: %v", err)
	}

	data, err := os.ReadFile(cfgPath)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("cannot parse written config: %v", err)
	}

	settings, ok := m["settings"].(map[string]interface{})
	if !ok || settings["theme"] != "dark" {
		t.Fatalf("settings not preserved: %v", m)
	}
	if _, ok := m["recentEntries"]; !ok {
		t.Fatalf("recentEntries not preserved: %v", m)
	}
	reg, ok := m[kbRegistryKey].(map[string]interface{})
	if !ok || reg["docs"] != "/tmp/docs-kb" {
		t.Fatalf("registry not written: %v", m)
	}
}
