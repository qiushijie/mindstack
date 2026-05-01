package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	t.Run("config file does not exist", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		app := NewApp()
		result := app.LoadConfig()

		if result != "{}" {
			t.Fatalf("expected '{}', got %q", result)
		}
	})

	t.Run("valid JSON config with recentEntries", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		cfg := AppConfig{
			LastFolderPath: "/tmp/folder",
			LastFilePath:   "/tmp/file.md",
			RecentEntries: []RecentEntry{
				{Path: "/tmp/a.md", IsDir: false},
				{Path: "/tmp/dir", IsDir: true},
			},
		}
		data, _ := json.Marshal(cfg)
		os.WriteFile(filepath.Join(tmpDir, "config.json"), data, 0644)

		app := NewApp()
		result := app.LoadConfig()

		var parsed AppConfig
		if err := json.Unmarshal([]byte(result), &parsed); err != nil {
			t.Fatalf("failed to parse result: %v", err)
		}
		if parsed.LastFolderPath != "/tmp/folder" {
			t.Fatalf("expected lastFolderPath '/tmp/folder', got %q", parsed.LastFolderPath)
		}
		if parsed.LastFilePath != "/tmp/file.md" {
			t.Fatalf("expected lastFilePath '/tmp/file.md', got %q", parsed.LastFilePath)
		}
		if len(parsed.RecentEntries) != 2 {
			t.Fatalf("expected 2 recentEntries, got %d", len(parsed.RecentEntries))
		}
		if parsed.RecentEntries[0].Path != "/tmp/a.md" {
			t.Fatalf("expected recentEntries[0].path '/tmp/a.md', got %q", parsed.RecentEntries[0].Path)
		}
		if parsed.RecentEntries[1].IsDir != true {
			t.Fatalf("expected recentEntries[1].isDir true, got false")
		}

		// Verify cached recentEntries
		app.mu.RLock()
		entries := app.recentEntries
		app.mu.RUnlock()
		if len(entries) != 2 {
			t.Fatalf("expected 2 cached recentEntries, got %d", len(entries))
		}
	})

	t.Run("invalid JSON returns empty object", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		os.WriteFile(filepath.Join(tmpDir, "config.json"), []byte("{invalid json}"), 0644)

		app := NewApp()
		result := app.LoadConfig()

		if result != "{invalid json}" {
			t.Fatalf("expected raw invalid json returned as-is, got %q", result)
		}
	})

	t.Run("config with lastFolderPath and lastFilePath", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		cfg := map[string]interface{}{
			"lastFolderPath": "/home/user/docs",
			"lastFilePath":   "/home/user/docs/readme.md",
		}
		data, _ := json.Marshal(cfg)
		os.WriteFile(filepath.Join(tmpDir, "config.json"), data, 0644)

		app := NewApp()
		result := app.LoadConfig()

		var parsed map[string]interface{}
		if err := json.Unmarshal([]byte(result), &parsed); err != nil {
			t.Fatalf("failed to parse result: %v", err)
		}
		if parsed["lastFolderPath"] != "/home/user/docs" {
			t.Fatalf("expected lastFolderPath '/home/user/docs', got %v", parsed["lastFolderPath"])
		}
		if parsed["lastFilePath"] != "/home/user/docs/readme.md" {
			t.Fatalf("expected lastFilePath '/home/user/docs/readme.md', got %v", parsed["lastFilePath"])
		}
	})
}

func TestSaveConfig(t *testing.T) {
	t.Run("save valid JSON", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		app := NewApp()
		content := `{"lastFolderPath":"/tmp/folder","lastFilePath":"/tmp/file.md"}`
		result := app.SaveConfig(content)

		if result != "" {
			t.Fatalf("expected empty string on success, got %q", result)
		}

		data, err := os.ReadFile(filepath.Join(tmpDir, "config.json"))
		if err != nil {
			t.Fatalf("failed to read config file: %v", err)
		}
		if string(data) != content {
			t.Fatalf("expected %q, got %q", content, string(data))
		}
	})

	t.Run("create nested directories automatically", func(t *testing.T) {
		tmpDir := t.TempDir()
		nestedDir := filepath.Join(tmpDir, "deep", "nested", "path")
		os.Setenv("MINDSTACK_CONFIG_DIR", nestedDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		app := NewApp()
		content := `{"key":"value"}`
		result := app.SaveConfig(content)

		if result != "" {
			t.Fatalf("expected empty string on success, got %q", result)
		}

		data, err := os.ReadFile(filepath.Join(nestedDir, "config.json"))
		if err != nil {
			t.Fatalf("failed to read config file: %v", err)
		}
		if string(data) != content {
			t.Fatalf("expected %q, got %q", content, string(data))
		}
	})

	t.Run("read back saved content", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		app := NewApp()
		original := AppConfig{
			LastFolderPath: "/tmp/a",
			LastFilePath:   "/tmp/a/b.md",
			RecentEntries: []RecentEntry{
				{Path: "/tmp/x.md", IsDir: false},
			},
		}
		data, _ := json.Marshal(original)
		app.SaveConfig(string(data))

		// Load it back
		loaded := app.LoadConfig()
		var parsed AppConfig
		if err := json.Unmarshal([]byte(loaded), &parsed); err != nil {
			t.Fatalf("failed to parse loaded config: %v", err)
		}
		if parsed.LastFolderPath != original.LastFolderPath {
			t.Fatalf("expected lastFolderPath %q, got %q", original.LastFolderPath, parsed.LastFolderPath)
		}
		if len(parsed.RecentEntries) != 1 {
			t.Fatalf("expected 1 recentEntry, got %d", len(parsed.RecentEntries))
		}
		if parsed.RecentEntries[0].Path != "/tmp/x.md" {
			t.Fatalf("expected recentEntry path '/tmp/x.md', got %q", parsed.RecentEntries[0].Path)
		}
	})
}

func TestSaveRecentEntriesLocked(t *testing.T) {
	t.Run("empty recentEntries", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		app := NewApp()
		app.mu.Lock()
		app.recentEntries = []RecentEntry{}
		app.saveRecentEntriesLocked()
		app.mu.Unlock()

		configPath := filepath.Join(tmpDir, "config.json")
		data, err := os.ReadFile(configPath)
		if err != nil {
			t.Fatalf("failed to read config file: %v", err)
		}
		var result map[string]interface{}
		if err := json.Unmarshal(data, &result); err != nil {
			t.Fatalf("failed to parse config: %v", err)
		}
		entries, ok := result["recentEntries"].([]interface{})
		if !ok {
			t.Fatal("recentEntries not found or not an array")
		}
		if len(entries) != 0 {
			t.Fatalf("expected 0 recentEntries, got %d", len(entries))
		}
	})

	t.Run("multiple recentEntries", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		app := NewApp()
		app.mu.Lock()
		app.recentEntries = []RecentEntry{
			{Path: "/tmp/a.md", IsDir: false},
			{Path: "/tmp/dir", IsDir: true},
			{Path: "/tmp/b.md", IsDir: false},
		}
		app.saveRecentEntriesLocked()
		app.mu.Unlock()

		configPath := filepath.Join(tmpDir, "config.json")
		data, err := os.ReadFile(configPath)
		if err != nil {
			t.Fatalf("failed to read config file: %v", err)
		}
		var result map[string]interface{}
		if err := json.Unmarshal(data, &result); err != nil {
			t.Fatalf("failed to parse config: %v", err)
		}
		entries, ok := result["recentEntries"].([]interface{})
		if !ok {
			t.Fatal("recentEntries not found or not an array")
		}
		if len(entries) != 3 {
			t.Fatalf("expected 3 recentEntries, got %d", len(entries))
		}
		// Verify first entry
		first := entries[0].(map[string]interface{})
		if first["path"] != "/tmp/a.md" {
			t.Fatalf("expected first entry path '/tmp/a.md', got %v", first["path"])
		}
		if first["isDir"] != false {
			t.Fatalf("expected first entry isDir false, got %v", first["isDir"])
		}
	})

	t.Run("preserve other fields in existing config", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		// Pre-create config with other fields
		configPath := filepath.Join(tmpDir, "config.json")
		os.WriteFile(configPath, []byte(`{"lastFolderPath":"/tmp","settings":{"theme":"dark"}}`), 0644)

		app := NewApp()
		app.mu.Lock()
		app.recentEntries = []RecentEntry{
			{Path: "/tmp/a.md", IsDir: false},
			{Path: "/tmp/dir", IsDir: true},
		}
		app.saveRecentEntriesLocked()
		app.mu.Unlock()

		data, err := os.ReadFile(configPath)
		if err != nil {
			t.Fatalf("failed to read config file: %v", err)
		}
		var result map[string]interface{}
		if err := json.Unmarshal(data, &result); err != nil {
			t.Fatalf("failed to parse config: %v", err)
		}

		// recentEntries should be correct
		entries, ok := result["recentEntries"].([]interface{})
		if !ok {
			t.Fatal("recentEntries not found or not an array")
		}
		if len(entries) != 2 {
			t.Fatalf("expected 2 recentEntries, got %d", len(entries))
		}

		// lastFolderPath should be preserved
		if result["lastFolderPath"] != "/tmp" {
			t.Fatalf("expected lastFolderPath '/tmp', got %v", result["lastFolderPath"])
		}

		// settings should be preserved
		settings, ok := result["settings"].(map[string]interface{})
		if !ok {
			t.Fatal("settings not found or not an object")
		}
		if settings["theme"] != "dark" {
			t.Fatalf("expected settings.theme 'dark', got %v", settings["theme"])
		}
	})

	t.Run("handle invalid existing config", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		// Pre-create invalid config
		configPath := filepath.Join(tmpDir, "config.json")
		os.WriteFile(configPath, []byte(`{broken json`), 0644)

		app := NewApp()
		app.mu.Lock()
		app.recentEntries = []RecentEntry{
			{Path: "/tmp/new.md", IsDir: false},
		}
		app.saveRecentEntriesLocked()
		app.mu.Unlock()

		data, err := os.ReadFile(configPath)
		if err != nil {
			t.Fatalf("failed to read config file: %v", err)
		}
		var result map[string]interface{}
		if err := json.Unmarshal(data, &result); err != nil {
			t.Fatalf("failed to parse config: %v", err)
		}
		entries, ok := result["recentEntries"].([]interface{})
		if !ok {
			t.Fatal("recentEntries not found or not an array")
		}
		if len(entries) != 1 {
			t.Fatalf("expected 1 recentEntry, got %d", len(entries))
		}
	})
}

func TestRemoveRecentEntry(t *testing.T) {
	t.Run("removes existing entry", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		// Create config with entries
		cfg := AppConfig{
			RecentEntries: []RecentEntry{
				{Path: "/tmp/a.md", IsDir: false},
				{Path: "/tmp/b.md", IsDir: false},
				{Path: "/tmp/dir", IsDir: true},
			},
		}
		data, _ := json.Marshal(cfg)
		os.WriteFile(filepath.Join(tmpDir, "config.json"), data, 0644)

		app := NewApp()
		app.LoadConfig()

		app.removeRecentEntry("/tmp/b.md")

		app.mu.RLock()
		entries := app.recentEntries
		app.mu.RUnlock()
		if len(entries) != 2 {
			t.Fatalf("expected 2 entries, got %d", len(entries))
		}
		if entries[0].Path != "/tmp/a.md" {
			t.Fatalf("expected first entry '/tmp/a.md', got %q", entries[0].Path)
		}
		if entries[1].Path != "/tmp/dir" {
			t.Fatalf("expected second entry '/tmp/dir', got %q", entries[1].Path)
		}

		// Verify persisted
		saved, _ := os.ReadFile(filepath.Join(tmpDir, "config.json"))
		var persisted map[string]interface{}
		json.Unmarshal(saved, &persisted)
		arr := persisted["recentEntries"].([]interface{})
		if len(arr) != 2 {
			t.Fatalf("expected 2 persisted entries, got %d", len(arr))
		}
	})

	t.Run("removing non-existent entry is no-op", func(t *testing.T) {
		tmpDir := t.TempDir()
		os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
		defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

		cfg := AppConfig{
			RecentEntries: []RecentEntry{
				{Path: "/tmp/a.md", IsDir: false},
			},
		}
		data, _ := json.Marshal(cfg)
		os.WriteFile(filepath.Join(tmpDir, "config.json"), data, 0644)

		app := NewApp()
		app.LoadConfig()

		app.removeRecentEntry("/tmp/nonexistent.md")

		app.mu.RLock()
		entries := app.recentEntries
		app.mu.RUnlock()
		if len(entries) != 1 {
			t.Fatalf("expected 1 entry, got %d", len(entries))
		}
	})
}

func TestSearchDocs(t *testing.T) {
	// Helper to create a meta.json file in the .mindstack directory.
	createMetaStore := func(t *testing.T, root string, store map[string]interface{}) {
		t.Helper()
		metaDir := filepath.Join(root, ".mindstack")
		if err := os.MkdirAll(metaDir, 0755); err != nil {
			t.Fatalf("failed to create .mindstack dir: %v", err)
		}
		data, err := json.MarshalIndent(store, "", "  ")
		if err != nil {
			t.Fatalf("failed to marshal meta store: %v", err)
		}
		if err := os.WriteFile(filepath.Join(metaDir, "meta.json"), data, 0644); err != nil {
			t.Fatalf("failed to write meta.json: %v", err)
		}
	}

	t.Run("matching tag returns results", func(t *testing.T) {
		tmpDir := t.TempDir()
		createMetaStore(t, tmpDir, map[string]interface{}{
			"notes/hello.md": map[string]interface{}{
				"title":   "Hello",
				"summary": "A hello document",
				"tags":    []string{"golang", "test"},
				"status":  "active",
			},
		})

		app := NewApp()
		app.SetRootPath(tmpDir)

		result := app.SearchDocs("golang")
		var parsed struct {
			Tag   string `json:"tag"`
			Items []struct {
				Path    string `json:"path"`
				AbsPath string `json:"abs_path"`
				Title   string `json:"title"`
				Status  string `json:"status"`
			} `json:"items"`
			Total int `json:"total"`
		}
		if err := json.Unmarshal([]byte(result), &parsed); err != nil {
			t.Fatalf("failed to parse result: %v", err)
		}
		if parsed.Total != 1 {
			t.Fatalf("expected total 1, got %d", parsed.Total)
		}
		if len(parsed.Items) != 1 {
			t.Fatalf("expected 1 item, got %d", len(parsed.Items))
		}
		if parsed.Items[0].Path != "notes/hello.md" {
			t.Fatalf("expected path 'notes/hello.md', got %q", parsed.Items[0].Path)
		}
		if parsed.Items[0].Title != "Hello" {
			t.Fatalf("expected title 'Hello', got %q", parsed.Items[0].Title)
		}
		if parsed.Items[0].Status != "active" {
			t.Fatalf("expected status 'active', got %q", parsed.Items[0].Status)
		}
	})

	t.Run("no matching tag returns empty results", func(t *testing.T) {
		tmpDir := t.TempDir()
		createMetaStore(t, tmpDir, map[string]interface{}{
			"notes/hello.md": map[string]interface{}{
				"title":  "Hello",
				"tags":   []string{"golang"},
				"status": "active",
			},
		})

		app := NewApp()
		app.SetRootPath(tmpDir)

		result := app.SearchDocs("python")
		var parsed struct {
			Items []interface{} `json:"items"`
			Total int           `json:"total"`
		}
		if err := json.Unmarshal([]byte(result), &parsed); err != nil {
			t.Fatalf("failed to parse result: %v", err)
		}
		if parsed.Total != 0 {
			t.Fatalf("expected total 0, got %d", parsed.Total)
		}
		if len(parsed.Items) != 0 {
			t.Fatalf("expected 0 items, got %d", len(parsed.Items))
		}
	})

	t.Run("no workspace returns error", func(t *testing.T) {
		app := NewApp()
		result := app.SearchDocs("golang")

		if result != `{"error":"no workspace open"}` {
			t.Fatalf("expected no workspace error, got %q", result)
		}
	})

	t.Run("no meta file returns empty results", func(t *testing.T) {
		tmpDir := t.TempDir()
		// No .mindstack directory at all

		app := NewApp()
		app.SetRootPath(tmpDir)

		result := app.SearchDocs("golang")
		var parsed struct {
			Items []interface{} `json:"items"`
			Total int           `json:"total"`
		}
		if err := json.Unmarshal([]byte(result), &parsed); err != nil {
			t.Fatalf("failed to parse result: %v", err)
		}
		if parsed.Total != 0 {
			t.Fatalf("expected total 0, got %d", parsed.Total)
		}
	})

	t.Run("multiple docs with same tag", func(t *testing.T) {
		tmpDir := t.TempDir()
		createMetaStore(t, tmpDir, map[string]interface{}{
			"a.md": map[string]interface{}{
				"title":  "Doc A",
				"tags":   []string{"golang", "tutorial"},
				"status": "active",
			},
			"b.md": map[string]interface{}{
				"title":  "Doc B",
				"tags":   []string{"golang"},
				"status": "draft",
			},
			"c.md": map[string]interface{}{
				"title":  "Doc C",
				"tags":   []string{"python"},
				"status": "active",
			},
		})

		app := NewApp()
		app.SetRootPath(tmpDir)

		result := app.SearchDocs("golang")
		var parsed struct {
			Total int `json:"total"`
		}
		if err := json.Unmarshal([]byte(result), &parsed); err != nil {
			t.Fatalf("failed to parse result: %v", err)
		}
		if parsed.Total != 2 {
			t.Fatalf("expected total 2, got %d", parsed.Total)
		}
	})
}
