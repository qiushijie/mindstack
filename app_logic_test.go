package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"mindstack/internal/llm"
)

// ---------------------------------------------------------------------------
// labelText / dialogText
// ---------------------------------------------------------------------------

func TestLabelText(t *testing.T) {
	app := NewApp()

	t.Run("all locales return correct translation", func(t *testing.T) {
		locales := map[string]string{
			"en": "Open Folder",
			"ja": "フォルダを開く",
			"fr": "Ouvrir le dossier",
			"de": "Ordner öffnen",
			"es": "Abrir carpeta",
			"ru": "Открыть папку",
			"ko": "폴더 열기",
			"zh": "打开文件夹",
		}
		for locale, expected := range locales {
			app.SetLocale(locale)
			got := app.labelText(dialogLabels, "openFolder")
			if got != expected {
				t.Errorf("locale=%q: expected %q, got %q", locale, expected, got)
			}
		}
	})

	t.Run("unknown locale falls back to en", func(t *testing.T) {
		app.SetLocale("xx")
		got := app.labelText(dialogLabels, "openFolder")
		if got != "Open Folder" {
			t.Fatalf("expected fallback to en, got %q", got)
		}
	})

	t.Run("empty locale falls back to en", func(t *testing.T) {
		app.SetLocale("")
		got := app.labelText(dialogLabels, "openFolder")
		if got != "Open Folder" {
			t.Fatalf("expected fallback to en for empty locale, got %q", got)
		}
	})

	t.Run("unknown key returns key itself", func(t *testing.T) {
		app.SetLocale("en")
		got := app.labelText(dialogLabels, "nonexistent")
		if got != "nonexistent" {
			t.Fatalf("expected key as fallback, got %q", got)
		}
	})
}

func TestDialogText(t *testing.T) {
	app := NewApp()
	app.SetLocale("zh")

	got := app.dialogText("confirmDelete")
	if got != "确认删除" {
		t.Fatalf("expected %q, got %q", "确认删除", got)
	}
}

// ---------------------------------------------------------------------------
// Getter / Setter
// ---------------------------------------------------------------------------

func TestSetRootPathAndGetRootPath(t *testing.T) {
	app := NewApp()

	t.Run("initially empty", func(t *testing.T) {
		if got := app.GetRootPath(); got != "" {
			t.Fatalf("expected empty, got %q", got)
		}
	})

	t.Run("set and get round-trip", func(t *testing.T) {
		app.SetRootPath("/tmp/mindstack-test")
		if got := app.GetRootPath(); got != "/tmp/mindstack-test" {
			t.Fatalf("expected /tmp/mindstack-test, got %q", got)
		}
	})
}

func TestSetWorkspaceRoot(t *testing.T) {
	app := NewApp()
	app.SetWorkspaceRoot("/tmp/ws-root")
	if got := app.GetRootPath(); got != "/tmp/ws-root" {
		t.Fatalf("expected /tmp/ws-root, got %q", got)
	}
}

func TestGetFileServerPort(t *testing.T) {
	app := NewApp()
	if got := app.GetFileServerPort(); got != 0 {
		t.Fatalf("expected 0 before server starts, got %d", got)
	}
}

// ---------------------------------------------------------------------------
// Chat / StreamChat — invalid JSON
// ---------------------------------------------------------------------------

func TestChat_InvalidJSON(t *testing.T) {
	app := NewApp()
	app.llm = newTestLLMService(t)

	result := app.Chat("not valid json")
	if result == "" {
		t.Fatal("expected non-empty result for invalid JSON")
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if _, ok := m["error"]; !ok {
		t.Fatal("expected 'error' key in result")
	}
}

func TestStreamChat_InvalidJSON(t *testing.T) {
	app := NewApp()
	app.llm = newTestLLMService(t)

	result := app.StreamChat("not valid json")
	if result == "" {
		t.Fatal("expected non-empty result for invalid JSON")
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if _, ok := m["error"]; !ok {
		t.Fatal("expected 'error' key in result")
	}
}

// ---------------------------------------------------------------------------
// StreamChat — already in progress
// ---------------------------------------------------------------------------

func TestStreamChat_AlreadyInProgress(t *testing.T) {
	app := NewApp()
	app.llm = newTestLLMService(t)

	atomic.StoreInt32(&app.streaming, 1)
	defer atomic.StoreInt32(&app.streaming, 0)

	result := app.StreamChat("[]")
	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if m["error"] != "stream already in progress" {
		t.Fatalf("expected 'stream already in progress', got %q", m["error"])
	}
}

// ---------------------------------------------------------------------------
// BuildWorkspace — state conflicts and empty root
// ---------------------------------------------------------------------------

func TestBuildWorkspace_EmptyRootPath(t *testing.T) {
	app := NewApp()
	result := app.BuildWorkspace()
	if result != `{"error":"no workspace open"}` {
		t.Fatalf("expected 'no workspace open' error, got %q", result)
	}
}

func TestBuildWorkspace_AlreadyInProgress(t *testing.T) {
	app := NewApp()
	app.SetRootPath("/tmp/some-workspace")
	app.llm = newTestLLMService(t)

	atomic.StoreInt32(&app.building, 1)
	defer atomic.StoreInt32(&app.building, 0)

	result := app.BuildWorkspace()
	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if m["error"] != "build already in progress" {
		t.Fatalf("expected 'build already in progress', got %q", m["error"])
	}
}

// ---------------------------------------------------------------------------
// SearchDocs — empty root
// ---------------------------------------------------------------------------

func TestSearchDocs_EmptyRootPath(t *testing.T) {
	app := NewApp()
	result := app.SearchDocs("tag")
	if result != `{"error":"no workspace open"}` {
		t.Fatalf("expected 'no workspace open' error, got %q", result)
	}
}

// ---------------------------------------------------------------------------
// GetActiveModelInfo — llm nil model
// ---------------------------------------------------------------------------

func TestGetActiveModelInfo_NilModel(t *testing.T) {
	app := NewApp()
	app.llm = newTestLLMService(t)

	result := app.GetActiveModelInfo()
	if result != `{"configured":false}` {
		t.Fatalf("expected configured:false, got %q", result)
	}
}

// ---------------------------------------------------------------------------
// ReloadLLM — no config file
// ---------------------------------------------------------------------------

func TestReloadLLM_NoConfig(t *testing.T) {
	app := NewApp()
	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	app.llm = newTestLLMServiceWithDir(tmpDir)

	result := app.ReloadLLM()
	if result == "" {
		t.Fatal("expected error when config file does not exist, got empty string")
	}
}

// ---------------------------------------------------------------------------
// AddRecentEntry — dedup, prepend, cap at 10
// ---------------------------------------------------------------------------

func TestAddRecentEntry(t *testing.T) {
	app := NewApp()
	// ctx is nil so rebuildMenu returns immediately — safe to call.

	t.Run("prepend new entry", func(t *testing.T) {
		app.AddRecentEntry("/a", true)
		app.mu.RLock()
		entries := app.recentEntries
		app.mu.RUnlock()
		if len(entries) != 1 || entries[0].Path != "/a" || !entries[0].IsDir {
			t.Fatalf("expected [{/a true}], got %v", entries)
		}
	})

	t.Run("dedup and prepend", func(t *testing.T) {
		app.AddRecentEntry("/b", false)
		app.AddRecentEntry("/a", true) // duplicate, should move to front

		app.mu.RLock()
		entries := app.recentEntries
		app.mu.RUnlock()
		if len(entries) != 2 {
			t.Fatalf("expected 2 entries after dedup, got %d", len(entries))
		}
		if entries[0].Path != "/a" {
			t.Fatalf("expected /a at front, got %q", entries[0].Path)
		}
		if entries[1].Path != "/b" {
			t.Fatalf("expected /b at index 1, got %q", entries[1].Path)
		}
	})

	t.Run("cap at 10", func(t *testing.T) {
		app.mu.Lock()
		app.recentEntries = nil
		app.mu.Unlock()

		for i := 0; i < 15; i++ {
			app.AddRecentEntry(filepath.Join("/p", string(rune('a'+i))), false)
		}

		app.mu.RLock()
		entries := app.recentEntries
		app.mu.RUnlock()
		if len(entries) != 10 {
			t.Fatalf("expected 10 entries, got %d", len(entries))
		}
		// Newest should be at front
		if entries[0].Path != filepath.Join("/p", string(rune('a'+14))) {
			t.Fatalf("expected newest entry at front, got %q", entries[0].Path)
		}
	})
}

// ---------------------------------------------------------------------------
// ClearRecentEntries
// ---------------------------------------------------------------------------

func TestClearRecentEntries(t *testing.T) {
	app := NewApp()
	// ctx is nil so rebuildMenu returns immediately — safe to call.

	app.AddRecentEntry("/a", true)
	app.AddRecentEntry("/b", false)

	app.ClearRecentEntries()

	app.mu.RLock()
	entries := app.recentEntries
	app.mu.RUnlock()
	if len(entries) != 0 {
		t.Fatalf("expected 0 entries after clear, got %d", len(entries))
	}
}

// ---------------------------------------------------------------------------
// LocalFileHandler
// ---------------------------------------------------------------------------

func TestLocalFileHandler_ServeHTTP(t *testing.T) {
	app := NewApp()

	t.Run("rejects non-GET methods", func(t *testing.T) {
		handler := NewLocalFileHandler(app)
		req := httptest.NewRequest(http.MethodPost, "/local-file/test.png", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for POST, got %d", rec.Code)
		}
	})

	t.Run("rejects wrong path prefix", func(t *testing.T) {
		handler := NewLocalFileHandler(app)
		req := httptest.NewRequest(http.MethodGet, "/other-prefix/test.png", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for wrong prefix, got %d", rec.Code)
		}
	})

	t.Run("returns 404 when root path is empty", func(t *testing.T) {
		handler := NewLocalFileHandler(app)
		req := httptest.NewRequest(http.MethodGet, "/local-file/test.png", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for empty root, got %d", rec.Code)
		}
	})

	t.Run("rejects relative paths", func(t *testing.T) {
		dir := t.TempDir()
		app.SetRootPath(dir)
		defer app.SetRootPath("")

		handler := NewLocalFileHandler(app)
		req := httptest.NewRequest(http.MethodGet, "/local-file/relative/path.png", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for relative path, got %d", rec.Code)
		}
	})

	t.Run("rejects non-image file types", func(t *testing.T) {
		dir := t.TempDir()
		app.SetRootPath(dir)
		defer app.SetRootPath("")

		// Create a test .txt file inside root
		testFile := filepath.Join(dir, "test.txt")
		if err := os.WriteFile(testFile, []byte("hello"), 0644); err != nil {
			t.Fatalf("failed to create test file: %v", err)
		}

		handler := NewLocalFileHandler(app)
		req := httptest.NewRequest(http.MethodGet, "/local-file/"+testFile, nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for non-image, got %d", rec.Code)
		}
	})

	t.Run("serves image file successfully", func(t *testing.T) {
		dir := t.TempDir()
		app.SetRootPath(dir)
		defer app.SetRootPath("")

		// Create a test .png file (fake content)
		testFile := filepath.Join(dir, "test.png")
		content := []byte("fake png content")
		if err := os.WriteFile(testFile, content, 0644); err != nil {
			t.Fatalf("failed to create test file: %v", err)
		}

		handler := NewLocalFileHandler(app)
		req := httptest.NewRequest(http.MethodGet, "/local-file/"+testFile, nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d; body: %s", rec.Code, rec.Body.String())
		}
		if rec.Body.String() != string(content) {
			t.Fatalf("expected body %q, got %q", content, rec.Body.String())
		}
	})

	t.Run("rejects path traversal outside root", func(t *testing.T) {
		dir := t.TempDir()
		app.SetRootPath(dir)
		defer app.SetRootPath("")

		handler := NewLocalFileHandler(app)
		req := httptest.NewRequest(http.MethodGet, "/local-file/"+filepath.Join(dir, "..", "..", "etc", "passwd"), nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code == http.StatusOK {
			t.Fatal("expected non-200 for path traversal")
		}
	})
}

// ---------------------------------------------------------------------------
// menuText (in main.go, covers labelText with menuLabels)
// ---------------------------------------------------------------------------

func TestMenuText(t *testing.T) {
	app := NewApp()

	t.Run("en locale", func(t *testing.T) {
		app.SetLocale("en")
		got := app.menuText("file")
		if got != "File" {
			t.Fatalf("expected 'File', got %q", got)
		}
	})

	t.Run("zh locale", func(t *testing.T) {
		app.SetLocale("zh")
		got := app.menuText("file")
		if got != "文件" {
			t.Fatalf("expected '文件', got %q", got)
		}
	})

	t.Run("unknown key returns key", func(t *testing.T) {
		app.SetLocale("en")
		got := app.menuText("bogus")
		if got != "bogus" {
			t.Fatalf("expected 'bogus', got %q", got)
		}
	})
}

// ---------------------------------------------------------------------------
// LoadConfig / SaveConfig
// ---------------------------------------------------------------------------

func TestLoadConfig_NoFile(t *testing.T) {
	app := NewApp()
	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	result := app.LoadConfig()
	if result != "{}" {
		t.Fatalf("expected '{}' for missing config, got %q", result)
	}
}

func TestSaveAndLoadConfig(t *testing.T) {
	app := NewApp()
	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	cfg := `{"lastFolderPath":"/tmp/test","recentEntries":[{"path":"/a","isDir":true}]}`
	if result := app.SaveConfig(cfg); result != "" {
		t.Fatalf("SaveConfig failed: %q", result)
	}

	result := app.LoadConfig()
	var got map[string]interface{}
	if err := json.Unmarshal([]byte(result), &got); err != nil {
		t.Fatalf("LoadConfig returned invalid JSON: %v", err)
	}
	if got["lastFolderPath"] != "/tmp/test" {
		t.Fatalf("expected lastFolderPath=/tmp/test, got %v", got["lastFolderPath"])
	}

	// Verify recentEntries cached internally
	app.mu.RLock()
	entries := app.recentEntries
	app.mu.RUnlock()
	if len(entries) != 1 || entries[0].Path != "/a" {
		t.Fatalf("expected recentEntries=[{/a true}], got %v", entries)
	}
}

// ---------------------------------------------------------------------------
// HandleOpenFile — additional edge cases
// ---------------------------------------------------------------------------

func TestHandleOpenFile_EmptyPath(t *testing.T) {
	app := NewApp()
	app.HandleOpenFile("") // should not panic
	if got := app.GetPendingOpenFile(); got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// newTestLLMService creates an llm.Service pointing to a temp config dir
// (no config file, so GetActiveModel returns nil).
func newTestLLMService(t *testing.T) *llm.Service {
	t.Helper()
	tmpDir := t.TempDir()
	return newTestLLMServiceWithDir(tmpDir)
}

func newTestLLMServiceWithDir(dir string) *llm.Service {
	configPath := filepath.Join(dir, "config.json")
	return llm.NewService(configPath)
}

// ---------------------------------------------------------------------------
// Chat — happy path with mock HTTP server
// ---------------------------------------------------------------------------

func TestChat_HappyPath(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// eino openai client sends POST to /chat/completions (relative to BaseURL)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"test-cm-123","object":"chat.completion","created":1700000000,"model":"gpt-4","choices":[{"index":0,"message":{"role":"assistant","content":"Hello from mock!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}`))
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	svc := llm.NewService(filepath.Join(tmpDir, "config.json"))
	err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID:     "test-model",
		Model:  "gpt-4",
		ApiURL: server.URL,
		ApiKey: "test-key",
	})
	if err != nil {
		t.Fatalf("failed to update model: %v", err)
	}

	app := NewApp()
	app.ctx = context.Background()
	app.llm = svc

	messages := `[{"role":"user","content":"hello"}]`
	result := app.Chat(messages)

	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v, got: %s", err, result)
	}
	if m["content"] != "Hello from mock!" {
		t.Fatalf("expected content 'Hello from mock!', got %q, full result: %s", m["content"], result)
	}
}

// ---------------------------------------------------------------------------
// Chat — no model configured (llm.Chat returns error)
// ---------------------------------------------------------------------------

func TestChat_NoModel(t *testing.T) {
	tmpDir := t.TempDir()
	svc := llm.NewService(filepath.Join(tmpDir, "config.json"))

	app := NewApp()
	app.ctx = context.Background()
	app.llm = svc

	messages := `[{"role":"user","content":"hello"}]`
	result := app.Chat(messages)

	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if _, ok := m["error"]; !ok {
		t.Fatal("expected error when no model is configured")
	}
}

// ---------------------------------------------------------------------------
// GetActiveModelInfo — with model configured
// ---------------------------------------------------------------------------

func TestGetActiveModelInfo_WithModel(t *testing.T) {
	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	svc := llm.NewService(filepath.Join(tmpDir, "config.json"))
	err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID:     "my-model-id",
		Model:  "gpt-4o",
		ApiURL: "http://localhost:12345",
		ApiKey: "test-key",
	})
	if err != nil {
		t.Fatalf("failed to update model: %v", err)
	}

	app := NewApp()
	app.llm = svc

	result := app.GetActiveModelInfo()
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if m["configured"] != true {
		t.Fatalf("expected configured=true, got %v", m["configured"])
	}
	if m["id"] != "my-model-id" {
		t.Fatalf("expected id='my-model-id', got %v", m["id"])
	}
	if m["model"] != "gpt-4o" {
		t.Fatalf("expected model='gpt-4o', got %v", m["model"])
	}
}

// ---------------------------------------------------------------------------
// ReloadLLM — success with valid config
// ---------------------------------------------------------------------------

func TestReloadLLM_Success(t *testing.T) {
	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	// Create a valid config.json with settings.models
	cfg := map[string]interface{}{
		"settings": map[string]interface{}{
			"activeModelId": "test",
			"models": []map[string]interface{}{
				{
					"id":     "test",
					"model":  "gpt-4",
					"apiUrl": "http://localhost:12345",
					"apiKey": "key",
				},
			},
		},
	}
	data, _ := json.Marshal(cfg)
	os.WriteFile(filepath.Join(tmpDir, "config.json"), data, 0644)

	svc := llm.NewService(filepath.Join(tmpDir, "config.json"))

	app := NewApp()
	app.llm = svc

	result := app.ReloadLLM()
	if result != "" {
		t.Fatalf("expected empty string on success, got %q", result)
	}
}

// ---------------------------------------------------------------------------
// ReloadLLM — config file has invalid model (missing apiUrl/apiKey)
// ---------------------------------------------------------------------------

func TestReloadLLM_InvalidModelConfig(t *testing.T) {
	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	// Config with model missing required apiUrl
	cfg := map[string]interface{}{
		"settings": map[string]interface{}{
			"activeModelId": "test",
			"models": []map[string]interface{}{
				{
					"id":    "test",
					"model": "gpt-4",
					// missing apiUrl and apiKey
				},
			},
		},
	}
	data, _ := json.Marshal(cfg)
	os.WriteFile(filepath.Join(tmpDir, "config.json"), data, 0644)

	svc := llm.NewService(filepath.Join(tmpDir, "config.json"))

	app := NewApp()
	app.llm = svc

	result := app.ReloadLLM()
	if result == "" {
		t.Fatal("expected error for invalid model config, got empty string")
	}
}

// ---------------------------------------------------------------------------
// ServeHTTP — request non-existent image file
// ---------------------------------------------------------------------------

func TestLocalFileHandler_NonExistentImageFile(t *testing.T) {
	dir := t.TempDir()
	app := NewApp()
	app.SetRootPath(dir)
	defer app.SetRootPath("")

	handler := NewLocalFileHandler(app)
	// Request a .png that doesn't exist on disk
	req := httptest.NewRequest(http.MethodGet, "/local-file/"+filepath.Join(dir, "missing.png"), nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for non-existent image, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// ServeHTTP — request directory (not a file)
// ---------------------------------------------------------------------------

func TestLocalFileHandler_RequestDirectory(t *testing.T) {
	dir := t.TempDir()
	app := NewApp()
	app.SetRootPath(dir)
	defer app.SetRootPath("")

	// Create a subdirectory
	subDir := filepath.Join(dir, "subdir")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("failed to create subdir: %v", err)
	}

	handler := NewLocalFileHandler(app)
	// Request the directory itself — it has no extension so it's forbidden
	req := httptest.NewRequest(http.MethodGet, "/local-file/"+subDir, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for directory (no allowed extension), got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// ServeHTTP — URL-encoded path
// ---------------------------------------------------------------------------

func TestLocalFileHandler_URLEncodedPath(t *testing.T) {
	dir := t.TempDir()
	app := NewApp()
	app.SetRootPath(dir)
	defer app.SetRootPath("")

	// Create an image file with space in name
	testFile := filepath.Join(dir, "my image.png")
	if err := os.WriteFile(testFile, []byte("png data"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}

	handler := NewLocalFileHandler(app)
	// URL-encode the path
	encodedPath := "/local-file/" + url.PathEscape(testFile)
	req := httptest.NewRequest(http.MethodGet, encodedPath, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for URL-encoded image path, got %d; body: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != "png data" {
		t.Fatalf("expected 'png data', got %q", rec.Body.String())
	}
}

// ---------------------------------------------------------------------------
// Chat — server returns error
// ---------------------------------------------------------------------------

func TestChat_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":{"message":"internal server error","type":"server_error"}}`))
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	svc := llm.NewService(filepath.Join(tmpDir, "config.json"))
	err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID:     "test-model",
		Model:  "gpt-4",
		ApiURL: server.URL,
		ApiKey: "test-key",
	})
	if err != nil {
		t.Fatalf("failed to update model: %v", err)
	}

	app := NewApp()
	app.ctx = context.Background()
	app.llm = svc

	messages := `[{"role":"user","content":"hello"}]`
	result := app.Chat(messages)

	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if _, ok := m["error"]; !ok {
		t.Fatal("expected error when server returns 500")
	}
}

// ---------------------------------------------------------------------------
// Chat — empty messages array
// ---------------------------------------------------------------------------

func TestChat_EmptyMessages(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"test","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"Empty!"},"finish_reason":"stop"}],"usage":{"prompt_tokens":0,"completion_tokens":1,"total_tokens":1}}`))
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	svc := llm.NewService(filepath.Join(tmpDir, "config.json"))
	err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID:     "test-model",
		Model:  "gpt-4",
		ApiURL: server.URL,
		ApiKey: "test-key",
	})
	if err != nil {
		t.Fatalf("failed to update model: %v", err)
	}

	app := NewApp()
	app.ctx = context.Background()
	app.llm = svc

	result := app.Chat("[]")
	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if m["content"] != "Empty!" {
		t.Fatalf("expected content 'Empty!', got %q", m["content"])
	}
}

// ---------------------------------------------------------------------------
// Chat — multiple messages
// ---------------------------------------------------------------------------

func TestChat_MultipleMessages(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"id":"test","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"Multi response"},"finish_reason":"stop"}],"usage":{"prompt_tokens":20,"completion_tokens":2,"total_tokens":22}}`))
	}))
	defer server.Close()

	tmpDir := t.TempDir()
	os.Setenv("MINDSTACK_CONFIG_DIR", tmpDir)
	defer os.Unsetenv("MINDSTACK_CONFIG_DIR")

	svc := llm.NewService(filepath.Join(tmpDir, "config.json"))
	err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID:     "test-model",
		Model:  "gpt-4",
		ApiURL: server.URL,
		ApiKey: "test-key",
	})
	if err != nil {
		t.Fatalf("failed to update model: %v", err)
	}

	app := NewApp()
	app.ctx = context.Background()
	app.llm = svc

	messages := `[{"role":"system","content":"You are helpful"},{"role":"user","content":"Hi"},{"role":"assistant","content":"Hello!"},{"role":"user","content":"Tell me more"}]`
	result := app.Chat(messages)
	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if m["content"] != "Multi response" {
		t.Fatalf("expected content 'Multi response', got %q", m["content"])
	}
}

// ---------------------------------------------------------------------------
// SearchDocs — error path (invalid meta.json)
// ---------------------------------------------------------------------------

func TestSearchDocs_InvalidMeta(t *testing.T) {
	tmpDir := t.TempDir()
	metaDir := filepath.Join(tmpDir, ".mindstack")
	if err := os.MkdirAll(metaDir, 0755); err != nil {
		t.Fatalf("failed to create .mindstack dir: %v", err)
	}
	// Write invalid JSON to meta.json
	os.WriteFile(filepath.Join(metaDir, "meta.json"), []byte("{invalid json}"), 0644)

	app := NewApp()
	app.SetRootPath(tmpDir)

	result := app.SearchDocs("test")
	var m map[string]string
	if err := json.Unmarshal([]byte(result), &m); err != nil {
		t.Fatalf("result is not valid JSON: %v", err)
	}
	if _, ok := m["error"]; !ok {
		t.Fatal("expected error for invalid meta.json, got success")
	}
}

// ---------------------------------------------------------------------------
// ServeHTTP — different image types return correct content type
// ---------------------------------------------------------------------------

func TestLocalFileHandler_DifferentImageTypes(t *testing.T) {
	dir := t.TempDir()
	app := NewApp()
	app.SetRootPath(dir)
	defer app.SetRootPath("")

	tests := []struct {
		ext         string
		expectedMIME string
	}{
		{".jpg", "image/jpeg"},
		{".gif", "image/gif"},
		{".svg", "image/svg+xml"},
		{".webp", "image/webp"},
		{".bmp", "image/bmp"},
		{".ico", "image/vnd.microsoft.icon"},
	}

	for _, tt := range tests {
		t.Run(tt.ext, func(t *testing.T) {
			testFile := filepath.Join(dir, "test"+tt.ext)
			if err := os.WriteFile(testFile, []byte("fake content"), 0644); err != nil {
				t.Fatalf("failed to create test file: %v", err)
			}

			handler := NewLocalFileHandler(app)
			req := httptest.NewRequest(http.MethodGet, "/local-file/"+testFile, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200 for %s, got %d", tt.ext, rec.Code)
			}
			if ct := rec.Header().Get("Content-Type"); ct != tt.expectedMIME {
				t.Fatalf("expected Content-Type %q, got %q", tt.expectedMIME, ct)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ServeHTTP — root path EvalSymlinks fails (non-existent root)
// ---------------------------------------------------------------------------

func TestLocalFileHandler_RootEvalSymlinksFails(t *testing.T) {
	nonExistentDir := filepath.Join(t.TempDir(), "nonexistent")
	app := NewApp()
	app.SetRootPath(nonExistentDir)
	defer app.SetRootPath("")

	handler := NewLocalFileHandler(app)
	req := httptest.NewRequest(http.MethodGet, "/local-file/"+filepath.Join(nonExistentDir, "test.png"), nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for non-existent root, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// ServeHTTP — symlink inside root points outside
// ---------------------------------------------------------------------------

func TestLocalFileHandler_SymlinkOutsideRoot(t *testing.T) {
	dir := t.TempDir()
	app := NewApp()
	app.SetRootPath(dir)
	defer app.SetRootPath("")

	// Create a directory outside root with a .png
	outsideDir := filepath.Join(t.TempDir(), "outside")
	if err := os.MkdirAll(outsideDir, 0755); err != nil {
		t.Fatalf("failed to create outside dir: %v", err)
	}
	outsideFile := filepath.Join(outsideDir, "secret.png")
	if err := os.WriteFile(outsideFile, []byte("secret"), 0644); err != nil {
		t.Fatalf("failed to create outside file: %v", err)
	}

	// Create symlink inside root pointing to outside file
	linkPath := filepath.Join(dir, "link.png")
	if err := os.Symlink(outsideFile, linkPath); err != nil {
		t.Fatalf("failed to create symlink: %v", err)
	}

	handler := NewLocalFileHandler(app)
	req := httptest.NewRequest(http.MethodGet, "/local-file/"+linkPath, nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	// Symlink resolves to a path outside root, should be forbidden
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for symlink outside root, got %d", rec.Code)
	}
}
