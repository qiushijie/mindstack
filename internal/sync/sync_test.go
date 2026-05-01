package sync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"mindstack/internal/llm"
	"mindstack/internal/meta"
	"mindstack/internal/workspace"

	"github.com/cloudwego/eino/components/model"
	einoschema "github.com/cloudwego/eino/schema"
)

// --- truncateContent tests ---

func TestTruncateContent_ShortContent(t *testing.T) {
	got := truncateContent("hello", 10)
	if got != "hello" {
		t.Fatalf("expected %q, got %q", "hello", got)
	}
}

func TestTruncateContent_LongContent(t *testing.T) {
	content := strings.Repeat("a", 100)
	got := truncateContent(content, 50)
	expected := strings.Repeat("a", 50) + "\n... [truncated]"
	if got != expected {
		t.Fatalf("expected truncated string of length %d, got length %d", len(expected), len(got))
	}
}

func TestTruncateContent_EmptyString(t *testing.T) {
	got := truncateContent("", 10)
	if got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}

func TestTruncateContent_MultiByteUTF8(t *testing.T) {
	// Each Chinese character is 3 bytes but 1 rune.
	// 10 Chinese runes = 30 bytes, truncate at 5 runes.
	content := "你好世界你好世界你好世界"
	got := truncateContent(content, 5)
	expected := "你好世界你" + "\n... [truncated]"
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

func TestTruncateContent_ExactLength(t *testing.T) {
	content := "abcde"
	got := truncateContent(content, 5)
	if got != "abcde" {
		t.Fatalf("expected %q, got %q", "abcde", got)
	}
}

func TestTruncateContent_ZeroMaxLen(t *testing.T) {
	got := truncateContent("hello", 0)
	expected := "\n... [truncated]"
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

// --- stripCodeFences tests ---

func TestStripCodeFences_PlainJSON(t *testing.T) {
	input := `{"title":"Test","summary":"A doc","tags":["a"]}`
	got := stripCodeFences(input)
	if got != input {
		t.Fatalf("expected %q, got %q", input, got)
	}
}

func TestStripCodeFences_JsonFence(t *testing.T) {
	input := "```json\n{\"title\":\"Test\"}\n```"
	got := stripCodeFences(input)
	expected := `{"title":"Test"}`
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

func TestStripCodeFences_PlainFence(t *testing.T) {
	input := "```\n{\"title\":\"Test\"}\n```"
	got := stripCodeFences(input)
	expected := `{"title":"Test"}`
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

func TestStripCodeFences_LeadingTrailingWhitespace(t *testing.T) {
	input := "  \n  {\"title\":\"Test\"}  \n  "
	got := stripCodeFences(input)
	expected := `{"title":"Test"}`
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

func TestStripCodeFences_JsonFenceWithExtraText(t *testing.T) {
	// stripCodeFences removes "```json" prefix, leaving remaining text on same line.
	// It does NOT strip arbitrary text after ```json.
	input := "```json here is some extra text\n{\"title\":\"Test\"}\n```"
	got := stripCodeFences(input)
	expected := "here is some extra text\n{\"title\":\"Test\"}"
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

func TestStripCodeFences_OnlyOpeningFence(t *testing.T) {
	input := "```json\n{\"title\":\"Test\"}"
	got := stripCodeFences(input)
	expected := `{"title":"Test"}`
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

func TestStripCodeFences_OnlyClosingFence(t *testing.T) {
	input := "{\"title\":\"Test\"}\n```"
	got := stripCodeFences(input)
	expected := `{"title":"Test"}`
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}
}

// --- listMarkdownFiles tests ---

func TestListMarkdownFiles_EmptyDirectory(t *testing.T) {
	dir := t.TempDir()
	files := listMarkdownFiles(dir)
	if len(files) != 0 {
		t.Fatalf("expected 0 files, got %d: %v", len(files), files)
	}
}

func TestListMarkdownFiles_MdFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "readme.md"), []byte("# Hello"), 0644)
	os.WriteFile(filepath.Join(dir, "guide.md"), []byte("# Guide"), 0644)

	files := listMarkdownFiles(dir)
	if len(files) != 2 {
		t.Fatalf("expected 2 files, got %d: %v", len(files), files)
	}
}

func TestListMarkdownFiles_SkipsHiddenDirectories(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)
	os.WriteFile(filepath.Join(dir, ".git", "config.md"), []byte("git config"), 0644)
	os.WriteFile(filepath.Join(dir, "visible.md"), []byte("# Visible"), 0644)

	files := listMarkdownFiles(dir)
	if len(files) != 1 {
		t.Fatalf("expected 1 file (skip .git), got %d: %v", len(files), files)
	}
	if files[0] != "visible.md" {
		t.Fatalf("expected visible.md, got %s", files[0])
	}
}

func TestListMarkdownFiles_SkipsMindstackDirectory(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, workspace.KnowledgeBaseDir), 0755)
	os.WriteFile(filepath.Join(dir, workspace.KnowledgeBaseDir, "meta.md"), []byte("meta"), 0644)
	os.WriteFile(filepath.Join(dir, "notes.md"), []byte("# Notes"), 0644)

	files := listMarkdownFiles(dir)
	if len(files) != 1 {
		t.Fatalf("expected 1 file (skip .mindstack), got %d: %v", len(files), files)
	}
	if files[0] != "notes.md" {
		t.Fatalf("expected notes.md, got %s", files[0])
	}
}

func TestListMarkdownFiles_SkipsNonMarkdownFiles(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "data.json"), []byte("{}"), 0644)
	os.WriteFile(filepath.Join(dir, "script.go"), []byte("package main"), 0644)
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte("# Doc"), 0644)

	files := listMarkdownFiles(dir)
	if len(files) != 1 {
		t.Fatalf("expected 1 file, got %d: %v", len(files), files)
	}
	if files[0] != "doc.md" {
		t.Fatalf("expected doc.md, got %s", files[0])
	}
}

func TestListMarkdownFiles_NestedDirectories(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "api", "v1"), 0755)
	os.WriteFile(filepath.Join(dir, "root.md"), []byte("# Root"), 0644)
	os.WriteFile(filepath.Join(dir, "api", "rest.md"), []byte("# REST"), 0644)
	os.WriteFile(filepath.Join(dir, "api", "v1", "spec.md"), []byte("# Spec"), 0644)

	files := listMarkdownFiles(dir)
	if len(files) != 3 {
		t.Fatalf("expected 3 files, got %d: %v", len(files), files)
	}

	// Verify relative paths are returned
	found := map[string]bool{}
	for _, f := range files {
		found[f] = true
	}
	for _, expected := range []string{
		filepath.Join("api", "rest.md"),
		filepath.Join("api", "v1", "spec.md"),
		"root.md",
	} {
		if !found[expected] {
			t.Fatalf("expected file %q in results", expected)
		}
	}
}

func TestListMarkdownFiles_MarkdownExtension(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "doc.markdown"), []byte("# Doc"), 0644)
	os.WriteFile(filepath.Join(dir, "note.md"), []byte("# Note"), 0644)

	files := listMarkdownFiles(dir)
	if len(files) != 2 {
		t.Fatalf("expected 2 files (.md + .markdown), got %d: %v", len(files), files)
	}
}

// --- SyncWorkspace tests ---

// setupTestWorkspace creates a temp directory with .mindstack subdirectory.
func setupTestWorkspace(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, workspace.KnowledgeBaseDir), 0755)
	return dir
}

// newNilLLMService returns an *llm.Service with no model configured.
// Any Chat() call will return "no model configured" error.
func newNilLLMService() *llm.Service {
	return llm.NewService("")
}

func TestSyncWorkspace_NoFiles(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	var progresses []SyncProgress
	onProgress := func(p SyncProgress) {
		progresses = append(progresses, p)
	}

	err := SyncWorkspace(context.Background(), svc, dir, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(progresses) != 1 {
		t.Fatalf("expected 1 progress event, got %d", len(progresses))
	}
	if progresses[0].Status != "complete" {
		t.Fatalf("expected status complete, got %s", progresses[0].Status)
	}
}

func TestSyncWorkspace_NilOnProgress(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	// Should not panic with nil onProgress
	err := SyncWorkspace(context.Background(), svc, dir, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSyncWorkspace_NilOnProgressWithFiles(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	os.WriteFile(filepath.Join(dir, "test.md"), []byte("# Test"), 0644)

	// Should not panic with nil onProgress even when processing files
	err := SyncWorkspace(context.Background(), svc, dir, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSyncWorkspace_LLMError_ReportsError(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService() // no model configured, Chat() returns error

	os.WriteFile(filepath.Join(dir, "doc1.md"), []byte("# Doc 1"), 0644)
	os.WriteFile(filepath.Join(dir, "doc2.md"), []byte("# Doc 2"), 0644)

	var progresses []SyncProgress
	onProgress := func(p SyncProgress) {
		progresses = append(progresses, p)
	}

	err := SyncWorkspace(context.Background(), svc, dir, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Expected sequence per file: processing -> error
	// Then final complete event.
	// Total: 2 * (processing + error) + complete = 5 events
	if len(progresses) != 5 {
		t.Fatalf("expected 5 progress events, got %d", len(progresses))
	}

	// File 1: processing -> error
	if progresses[0].Status != "processing" {
		t.Fatalf("progress[0]: expected processing, got %s", progresses[0].Status)
	}
	if progresses[1].Status != "error" {
		t.Fatalf("progress[1]: expected error, got %s", progresses[1].Status)
	}
	if progresses[1].Error == "" {
		t.Fatal("progress[1]: expected non-empty error message")
	}

	// File 2: processing -> error
	if progresses[2].Status != "processing" {
		t.Fatalf("progress[2]: expected processing, got %s", progresses[2].Status)
	}
	if progresses[3].Status != "error" {
		t.Fatalf("progress[3]: expected error, got %s", progresses[3].Status)
	}
	if progresses[3].Error == "" {
		t.Fatal("progress[3]: expected non-empty error message")
	}

	// Final complete event
	if progresses[4].Status != "complete" {
		t.Fatalf("progress[4]: expected complete, got %s", progresses[4].Status)
	}
}

func TestSyncWorkspace_ContextCancellation(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	os.WriteFile(filepath.Join(dir, "doc1.md"), []byte("# Doc 1"), 0644)
	os.WriteFile(filepath.Join(dir, "doc2.md"), []byte("# Doc 2"), 0644)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	err := SyncWorkspace(ctx, svc, dir, func(SyncProgress) {})
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
	if ctx.Err() != context.Canceled {
		t.Fatalf("expected context.Canceled, got %v", ctx.Err())
	}
}

func TestSyncWorkspace_ContextCancellationBetweenFiles(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	// Create several files so the loop iterates multiple times
	for i := 0; i < 5; i++ {
		os.WriteFile(filepath.Join(dir, "doc"+string(rune('0'+i))+".md"), []byte("# Doc"), 0644)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()
	// Context will expire almost immediately

	_ = SyncWorkspace(ctx, svc, dir, func(SyncProgress) {})
	// The function should return ctx.Err() at some point during iteration.
	// We don't assert the exact error because timing is non-deterministic,
	// but it should not panic.
}

func TestSyncWorkspace_ReportsProgressOrder(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	os.WriteFile(filepath.Join(dir, "a.md"), []byte("# A"), 0644)

	var progresses []SyncProgress
	onProgress := func(p SyncProgress) {
		progresses = append(progresses, p)
	}

	err := SyncWorkspace(context.Background(), svc, dir, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Expected order: processing -> error -> complete
	if len(progresses) != 3 {
		t.Fatalf("expected 3 events, got %d", len(progresses))
	}
	if progresses[0].Status != "processing" {
		t.Fatalf("first event should be processing, got %s", progresses[0].Status)
	}
	if progresses[0].File != "a.md" {
		t.Fatalf("first event file should be a.md, got %s", progresses[0].File)
	}
	if progresses[0].Current != 1 || progresses[0].Total != 1 {
		t.Fatalf("first event: expected current=1 total=1, got current=%d total=%d",
			progresses[0].Current, progresses[0].Total)
	}
	if progresses[1].Status != "error" {
		t.Fatalf("second event should be error, got %s", progresses[1].Status)
	}
	if progresses[2].Status != "complete" {
		t.Fatalf("third event should be complete, got %s", progresses[2].Status)
	}
}

// --- generateMeta tests (via mock) ---

// mockChatModel implements model.ChatModel for testing.
type mockChatModel struct {
	generateFn func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error)
}

func (m *mockChatModel) Generate(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
	if m.generateFn != nil {
		return m.generateFn(ctx, input, opts...)
	}
	return &einoschema.Message{Content: "{}"}, nil
}

func (m *mockChatModel) Stream(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.StreamReader[*einoschema.Message], error) {
	return nil, nil
}

func (m *mockChatModel) BindTools(tools []*einoschema.ToolInfo) error {
	return nil
}

// newMockLLMService creates an *llm.Service with an injected mock chatModel.
// Since we are in a different package (sync) we cannot access unexported fields
// directly. Instead we use a test helper that constructs the service via
// exported methods. But UpdateModel creates a real OpenAI client.
//
// Workaround: use the fact that llm.Service embeds chatModel via a pointer
// field. We construct the service and inject the mock through a wrapper.
//
// Actually, since chatModel is unexported on llm.Service, we truly cannot
// inject from this package. So we test generateMeta indirectly through
// SyncWorkspace with a real nil-model service (error path only).
//
// For successful generateMeta path, we rely on integration tests.

// --- SyncWorkspace success path with real model injection ---
// Since llm.Service.chatModel is unexported, we test the success path by
// verifying the overall flow when the LLM returns valid JSON.
// We use a small helper that creates a service via exported API but
// points to a fake endpoint - so this only tests error handling.

func TestSyncWorkspace_ReadFileError_ReportsError(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	// Create an md file, then remove read permissions to force ReadFile error
	mdPath := filepath.Join(dir, "noperm.md")
	os.WriteFile(mdPath, []byte("# No perm"), 0644)
	os.Chmod(mdPath, 0000)
	defer os.Chmod(mdPath, 0644) // restore for cleanup

	var progresses []SyncProgress
	onProgress := func(p SyncProgress) {
		progresses = append(progresses, p)
	}

	err := SyncWorkspace(context.Background(), svc, dir, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should report processing then error (read failure), then complete
	if len(progresses) < 3 {
		t.Fatalf("expected at least 3 events, got %d", len(progresses))
	}

	// Find error events
	var errorEvents []SyncProgress
	for _, p := range progresses {
		if p.Status == "error" {
			errorEvents = append(errorEvents, p)
		}
	}
	if len(errorEvents) == 0 {
		t.Fatal("expected at least one error event for unreadable file")
	}
	if !strings.Contains(errorEvents[0].Error, "read:") {
		t.Fatalf("expected read error, got: %s", errorEvents[0].Error)
	}
}

// --- generateMeta success path tests with mock HTTP server ---

// openaiResponse is the JSON response format expected by the eino OpenAI client.
type openaiResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// newMockLLMService creates an llm.Service backed by a mock OpenAI-compatible API server.
func newMockLLMService(t *testing.T, responseContent string) (*llm.Service, *httptest.Server) {
	t.Helper()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("unexpected request path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}
		if r.Method != http.MethodPost {
			t.Errorf("unexpected request method: %s", r.Method)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		resp := openaiResponse{
			ID:     "test-id",
			Object: "chat.completion",
			Choices: []struct {
				Index   int `json:"index"`
				Message struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"message"`
				FinishReason string `json:"finish_reason"`
			}{
				{
					Index: 0,
					Message: struct {
						Role    string `json:"role"`
						Content string `json:"content"`
					}{
						Role:    "assistant",
						Content: responseContent,
					},
					FinishReason: "stop",
				},
			},
			Usage: struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				TotalTokens      int `json:"total_tokens"`
			}{
				PromptTokens: 10, CompletionTokens: 20, TotalTokens: 30,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))

	svc := llm.NewService(t.TempDir())
	err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID:     "test",
		Model:  "test-model",
		ApiURL: server.URL,
		ApiKey: "test-key",
	})
	if err != nil {
		server.Close()
		t.Fatalf("failed to update model: %v", err)
	}

	return svc, server
}

func TestGenerateMeta_Success(t *testing.T) {
	content := `{"title":"Test Document","summary":"A test document for unit testing.","tags":["test","unit-test","mock"]}`
	svc, server := newMockLLMService(t, content)
	defer server.Close()

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "example.md"), []byte("# Example\n\nSome content here."), 0644)

	var progresses []SyncProgress
	onProgress := func(p SyncProgress) {
		progresses = append(progresses, p)
	}

	err := SyncWorkspace(context.Background(), svc, dir, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Expected: processing -> done -> complete
	if len(progresses) != 3 {
		t.Fatalf("expected 3 progress events, got %d", len(progresses))
	}
	if progresses[0].Status != "processing" {
		t.Fatalf("progress[0]: expected processing, got %s", progresses[0].Status)
	}
	if progresses[0].File != "example.md" {
		t.Fatalf("progress[0]: expected file example.md, got %s", progresses[0].File)
	}
	if progresses[1].Status != "done" {
		t.Fatalf("progress[1]: expected done, got %s", progresses[1].Status)
	}
	if progresses[1].Summary != "A test document for unit testing." {
		t.Fatalf("progress[1]: unexpected summary: %s", progresses[1].Summary)
	}
	if progresses[2].Status != "complete" {
		t.Fatalf("progress[2]: expected complete, got %s", progresses[2].Status)
	}

	// Verify metadata was saved correctly
	m, err := meta.LoadMeta(dir, "example.md")
	if err != nil {
		t.Fatalf("failed to load meta: %v", err)
	}
	if m.Title != "Test Document" {
		t.Fatalf("expected title 'Test Document', got %q", m.Title)
	}
	if m.Summary != "A test document for unit testing." {
		t.Fatalf("expected summary 'A test document for unit testing.', got %q", m.Summary)
	}
	if len(m.Tags) != 3 {
		t.Fatalf("expected 3 tags, got %d: %v", len(m.Tags), m.Tags)
	}
	if m.Status != "active" {
		t.Fatalf("expected status 'active', got %q", m.Status)
	}
}

func TestGenerateMeta_Success_MultipleFiles(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		var title, summary string
		switch callCount {
		case 1:
			title = "First Doc"
			summary = "The first document."
		default:
			title = "Second Doc"
			summary = "The second document."
		}

		resp := openaiResponse{
			ID:     "test-id",
			Object: "chat.completion",
			Choices: []struct {
				Index   int `json:"index"`
				Message struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"message"`
				FinishReason string `json:"finish_reason"`
			}{
				{
					Index: 0,
					Message: struct {
						Role    string `json:"role"`
						Content string `json:"content"`
					}{
						Role:    "assistant",
						Content: `{"title":"` + title + `","summary":"` + summary + `","tags":["test"]}`,
					},
					FinishReason: "stop",
				},
			},
			Usage: struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				TotalTokens      int `json:"total_tokens"`
			}{
				PromptTokens: 10, CompletionTokens: 20, TotalTokens: 30,
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	svc := llm.NewService(t.TempDir())
	err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID: "test", Model: "test-model", ApiURL: server.URL, ApiKey: "test-key",
	})
	if err != nil {
		t.Fatalf("failed to update model: %v", err)
	}

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "a.md"), []byte("# A"), 0644)
	os.WriteFile(filepath.Join(dir, "b.md"), []byte("# B"), 0644)

	err = SyncWorkspace(context.Background(), svc, dir, func(SyncProgress) {})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if callCount != 2 {
		t.Fatalf("expected 2 LLM calls, got %d", callCount)
	}

	m1, err := meta.LoadMeta(dir, "a.md")
	if err != nil {
		t.Fatalf("failed to load meta for a.md: %v", err)
	}
	if m1.Title != "First Doc" {
		t.Fatalf("expected title 'First Doc', got %q", m1.Title)
	}

	m2, err := meta.LoadMeta(dir, "b.md")
	if err != nil {
		t.Fatalf("failed to load meta for b.md: %v", err)
	}
	if m2.Title != "Second Doc" {
		t.Fatalf("expected title 'Second Doc', got %q", m2.Title)
	}
}

func TestGenerateMeta_InvalidJSONResponse(t *testing.T) {
	// Return non-JSON content from the mock LLM server
	svc, server := newMockLLMService(t, "This is not JSON at all!")
	defer server.Close()

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "broken.md"), []byte("# Broken"), 0644)

	var progresses []SyncProgress
	onProgress := func(p SyncProgress) {
		progresses = append(progresses, p)
	}

	err := SyncWorkspace(context.Background(), svc, dir, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Expected: processing -> error (JSON parse failure) -> complete
	if len(progresses) != 3 {
		t.Fatalf("expected 3 progress events, got %d", len(progresses))
	}
	if progresses[0].Status != "processing" {
		t.Fatalf("progress[0]: expected processing, got %s", progresses[0].Status)
	}
	if progresses[1].Status != "error" {
		t.Fatalf("progress[1]: expected error, got %s", progresses[1].Status)
	}
	if !strings.Contains(progresses[1].Error, "parse LLM response") {
		t.Fatalf("expected parse LLM response error, got: %s", progresses[1].Error)
	}
	if progresses[2].Status != "complete" {
		t.Fatalf("progress[2]: expected complete, got %s", progresses[2].Status)
	}
}

func TestGenerateMeta_CodeFencedJSONResponse(t *testing.T) {
	// Return valid JSON wrapped in code fences (common LLM behavior)
	inner := `{"title":"Fenced","summary":"A fenced response.","tags":["fenced"]}`
	content := "```json\n" + inner + "\n```"
	svc, server := newMockLLMService(t, content)
	defer server.Close()

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "fenced.md"), []byte("# Fenced"), 0644)

	err := SyncWorkspace(context.Background(), svc, dir, func(SyncProgress) {})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, err := meta.LoadMeta(dir, "fenced.md")
	if err != nil {
		t.Fatalf("failed to load meta: %v", err)
	}
	if m.Title != "Fenced" {
		t.Fatalf("expected title 'Fenced', got %q", m.Title)
	}
	if m.Summary != "A fenced response." {
		t.Fatalf("expected summary 'A fenced response.', got %q", m.Summary)
	}
}

func TestGenerateMeta_PreservesExistingStatus(t *testing.T) {
	content := `{"title":"Updated","summary":"Updated summary.","tags":["updated"]}`
	svc, server := newMockLLMService(t, content)
	defer server.Close()

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "existing.md"), []byte("# Existing"), 0644)

	// Save pre-existing metadata with a non-default status
	existingMeta := &meta.DocumentMeta{
		Title:   "Old Title",
		Summary: "Old summary",
		Tags:    []string{"old"},
		Status:  "archived",
	}
	if err := meta.SaveMeta(dir, "existing.md", existingMeta); err != nil {
		t.Fatalf("failed to save existing meta: %v", err)
	}

	err := SyncWorkspace(context.Background(), svc, dir, func(SyncProgress) {})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, err := meta.LoadMeta(dir, "existing.md")
	if err != nil {
		t.Fatalf("failed to load meta: %v", err)
	}
	// Title and summary should be updated by LLM
	if m.Title != "Updated" {
		t.Fatalf("expected title 'Updated', got %q", m.Title)
	}
	// Status should be preserved from the existing metadata
	if m.Status != "archived" {
		t.Fatalf("expected status 'archived' to be preserved, got %q", m.Status)
	}
}
