package build

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"mindstack/internal/llm"
	"mindstack/internal/meta"
	"mindstack/internal/workspace"

	"github.com/cloudwego/eino/components/model"
	einoschema "github.com/cloudwego/eino/schema"
)

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

// --- BuildWorkspace tests ---

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

func TestBuildWorkspace_NoFiles(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	var progresses []BuildProgress
	onProgress := func(p BuildProgress) {
		progresses = append(progresses, p)
	}

	err := BuildWorkspace(context.Background(), svc, dir, false, onProgress)
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

func TestBuildWorkspace_NilOnProgress(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	// Should not panic with nil onProgress
	err := BuildWorkspace(context.Background(), svc, dir, false, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildWorkspace_NilOnProgressWithFiles(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	os.WriteFile(filepath.Join(dir, "test.md"), []byte("# Test"), 0644)

	// Should not panic with nil onProgress even when processing files
	err := BuildWorkspace(context.Background(), svc, dir, false, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestBuildWorkspace_LLMError_ReportsError(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService() // no model configured, Chat() returns error

	os.WriteFile(filepath.Join(dir, "doc1.md"), []byte("# Doc 1"), 0644)
	os.WriteFile(filepath.Join(dir, "doc2.md"), []byte("# Doc 2"), 0644)

	var progresses []BuildProgress
	onProgress := func(p BuildProgress) {
		progresses = append(progresses, p)
	}

	err := BuildWorkspace(context.Background(), svc, dir, false, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Expected: 2 * (processing + error) + meta complete + relation complete = 6 events.
	// Workers run concurrently, so the per-file events may interleave.
	if len(progresses) != 6 {
		t.Fatalf("expected 6 progress events, got %d", len(progresses))
	}

	processingCount, errorCount := 0, 0
	for i, p := range progresses[:4] {
		switch p.Status {
		case "processing":
			processingCount++
		case "error":
			errorCount++
			if p.Error == "" {
				t.Fatalf("progress[%d]: expected non-empty error message", i)
			}
		default:
			t.Fatalf("progress[%d]: expected processing or error, got %s", i, p.Status)
		}
	}
	if processingCount != 2 || errorCount != 2 {
		t.Fatalf("expected 2 processing + 2 error events, got %d processing + %d error", processingCount, errorCount)
	}

	// Meta complete
	if progresses[4].Status != "complete" || progresses[4].Phase != "meta" {
		t.Fatalf("progress[4]: expected meta complete, got status=%s phase=%s", progresses[4].Status, progresses[4].Phase)
	}

	// Relation complete
	if progresses[5].Status != "complete" || progresses[5].Phase != "relation" {
		t.Fatalf("progress[5]: expected relation complete, got status=%s phase=%s", progresses[5].Status, progresses[5].Phase)
	}
}

func TestBuildWorkspace_ContextCancellation(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	os.WriteFile(filepath.Join(dir, "doc1.md"), []byte("# Doc 1"), 0644)
	os.WriteFile(filepath.Join(dir, "doc2.md"), []byte("# Doc 2"), 0644)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	err := BuildWorkspace(ctx, svc, dir, false, func(BuildProgress) {})
	if err == nil {
		t.Fatal("expected error from cancelled context")
	}
	if ctx.Err() != context.Canceled {
		t.Fatalf("expected context.Canceled, got %v", ctx.Err())
	}
}

func TestBuildWorkspace_ContextCancellationBetweenFiles(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	// Create several files so the loop iterates multiple times
	for i := 0; i < 5; i++ {
		os.WriteFile(filepath.Join(dir, "doc"+string(rune('0'+i))+".md"), []byte("# Doc"), 0644)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancel()
	// Context will expire almost immediately

	_ = BuildWorkspace(ctx, svc, dir, false, func(BuildProgress) {})
	// The function should return ctx.Err() at some point during iteration.
	// We don't assert the exact error because timing is non-deterministic,
	// but it should not panic.
}

func TestBuildWorkspace_ReportsProgressOrder(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	os.WriteFile(filepath.Join(dir, "a.md"), []byte("# A"), 0644)

	var progresses []BuildProgress
	onProgress := func(p BuildProgress) {
		progresses = append(progresses, p)
	}

	err := BuildWorkspace(context.Background(), svc, dir, false, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Expected order: processing -> error -> meta complete -> relation complete
	if len(progresses) != 4 {
		t.Fatalf("expected 4 events, got %d", len(progresses))
	}
	if progresses[0].Status != "processing" {
		t.Fatalf("first event should be processing, got %s", progresses[0].Status)
	}
	if progresses[0].File != "a.md" {
		t.Fatalf("first event file should be a.md, got %s", progresses[0].File)
	}
	if progresses[0].Current != 0 || progresses[0].Total != 1 {
		t.Fatalf("first event: expected current=0 total=1 (nothing completed yet), got current=%d total=%d",
			progresses[0].Current, progresses[0].Total)
	}
	if progresses[1].Status != "error" {
		t.Fatalf("second event should be error, got %s", progresses[1].Status)
	}
	if progresses[1].Current != 1 {
		t.Fatalf("second event: expected current=1 (one file completed), got %d", progresses[1].Current)
	}
	if progresses[2].Status != "complete" || progresses[2].Phase != "meta" {
		t.Fatalf("third event should be meta complete, got status=%s phase=%s", progresses[2].Status, progresses[2].Phase)
	}
	if progresses[3].Status != "complete" || progresses[3].Phase != "relation" {
		t.Fatalf("fourth event should be relation complete, got status=%s phase=%s", progresses[3].Status, progresses[3].Phase)
	}
}

func TestBuildWorkspace_MetaStoreSaveFailure_ReturnsError(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	os.WriteFile(filepath.Join(dir, "doc.md"), []byte("# Doc"), 0644)

	// Make the .mindstack directory read-only so metaStore.Save fails at the
	// end of the meta phase.
	kbDir := filepath.Join(dir, workspace.KnowledgeBaseDir)
	if err := os.Chmod(kbDir, 0555); err != nil {
		t.Fatalf("chmod: %v", err)
	}
	defer os.Chmod(kbDir, 0755) // restore for cleanup

	err := BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {})
	if err == nil {
		t.Fatal("expected error when meta store save fails")
	}
	if !strings.Contains(err.Error(), "save meta store") {
		t.Fatalf("expected 'save meta store' error, got: %v", err)
	}
}

func TestBuildWorkspace_ProgressCurrentIsMonotonic(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	// Enough files that workers interleave; every file errors on the nil model.
	for i := 0; i < 16; i++ {
		os.WriteFile(filepath.Join(dir, "doc"+strings.Repeat("x", i+1)+".md"), []byte("# Doc"), 0644)
	}

	var progresses []BuildProgress
	err := BuildWorkspace(context.Background(), svc, dir, false, func(p BuildProgress) {
		progresses = append(progresses, p)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Within each phase, Current must never decrease.
	lastByPhase := map[string]int{"meta": 0, "relation": 0}
	for _, p := range progresses {
		if p.Current < lastByPhase[p.Phase] {
			t.Fatalf("phase %s: Current went backwards: %d after %d", p.Phase, p.Current, lastByPhase[p.Phase])
		}
		lastByPhase[p.Phase] = p.Current
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
// Since we are in a different package (build) we cannot access unexported fields
// directly. Instead we use a test helper that constructs the service via
// exported methods. But UpdateModel creates a real OpenAI client.
//
// Workaround: use the fact that llm.Service embeds chatModel via a pointer
// field. We construct the service and inject the mock through a wrapper.
//
// Actually, since chatModel is unexported on llm.Service, we truly cannot
// inject from this package. So we test generateMeta indirectly through
// BuildWorkspace with a real nil-model service (error path only).
//
// For successful generateMeta path, we rely on integration tests.

// --- BuildWorkspace success path with real model injection ---
// Since llm.Service.chatModel is unexported, we test the success path by
// verifying the overall flow when the LLM returns valid JSON.
// We use a small helper that creates a service via exported API but
// points to a fake endpoint - so this only tests error handling.

func TestBuildWorkspace_ReadFileError_ReportsError(t *testing.T) {
	dir := setupTestWorkspace(t)
	svc := newNilLLMService()

	// Create an md file, then remove read permissions to force ReadFile error
	mdPath := filepath.Join(dir, "noperm.md")
	os.WriteFile(mdPath, []byte("# No perm"), 0644)
	os.Chmod(mdPath, 0000)
	defer os.Chmod(mdPath, 0644) // restore for cleanup

	var progresses []BuildProgress
	onProgress := func(p BuildProgress) {
		progresses = append(progresses, p)
	}

	err := BuildWorkspace(context.Background(), svc, dir, false, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should report processing then error (read failure), then complete
	if len(progresses) < 3 {
		t.Fatalf("expected at least 3 events, got %d", len(progresses))
	}

	// Find error events
	var errorEvents []BuildProgress
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
	content := `{"summary":"A test document for unit testing.","tags":["test","unit-test","mock"],"headings":[{"level":1,"text":"Test Document"}]}`
	svc, server := newMockLLMService(t, content)
	defer server.Close()

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "example.md"), []byte("# Example\n\nSome content here."), 0644)

	var progresses []BuildProgress
	onProgress := func(p BuildProgress) {
		progresses = append(progresses, p)
	}

	err := BuildWorkspace(context.Background(), svc, dir, false, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Must contain: processing -> done -> meta complete -> relation complete
	var foundProcessing, foundDone, foundMetaComplete, foundRelationComplete bool
	for _, p := range progresses {
		switch {
		case p.Status == "processing" && p.File == "example.md":
			foundProcessing = true
		case p.Status == "done" && p.Summary == "A test document for unit testing.":
			foundDone = true
		case p.Status == "complete" && p.Phase == "meta":
			foundMetaComplete = true
		case p.Status == "complete" && p.Phase == "relation":
			foundRelationComplete = true
		}
	}
	if !foundProcessing {
		t.Fatal("expected processing event for example.md")
	}
	if !foundDone {
		t.Fatal("expected done event with correct summary")
	}
	if !foundMetaComplete {
		t.Fatalf("expected meta complete event, got events: %v", progresses)
	}
	if !foundRelationComplete {
		t.Fatalf("expected relation complete event, got events: %v", progresses)
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
	var metaCallCount, relationCallCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Detect prompt type from request body
		var reqBody struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		json.NewDecoder(r.Body).Decode(&reqBody)

		var promptContent strings.Builder
		for _, m := range reqBody.Messages {
			promptContent.WriteString(m.Content)
		}
		prompt := promptContent.String()

		isRelationPrompt := strings.Contains(prompt, "Evaluate how related it is to each")

		var responseContent string
		if isRelationPrompt {
			relationCallCount.Add(1)
			// Determine the source doc from the prompt line "- path: \"xxx\"" to return matching target
			var targetDoc string
			if strings.Contains(prompt, `- path: "a.md"`) {
				targetDoc = "b.md"
			} else {
				targetDoc = "a.md"
			}
			responseContent = `[{"target":"` + targetDoc + `","score":0.9,"reason":"both are test docs"}]`
		} else {
			metaCallCount.Add(1)
			// Files are processed concurrently, so derive the title from the
			// filename in the prompt rather than the call order.
			title, summary := "Second Doc", "The second document."
			if strings.Contains(prompt, "Document filename: a.md") {
				title, summary = "First Doc", "The first document."
			}
			responseContent = `{"summary":"` + summary + `","tags":["test"],"headings":[{"level":1,"text":"` + title + `"}]}`
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

	err = BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if got := metaCallCount.Load(); got != 2 {
		t.Fatalf("expected 2 meta LLM calls, got %d", got)
	}
	if got := relationCallCount.Load(); got != 2 {
		t.Fatalf("expected 2 relation LLM calls, got %d", got)
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

func TestGenerateMeta_KeywordsAndAliases(t *testing.T) {
	content := `{"summary":"A test document for unit testing.","tags":["test","unit-test","mock"],"keywords":["unit test","mock","testing","fixture"],"aliases":["Unit Test","UT"],"headings":[{"level":1,"text":"Test Document"}]}`
	svc, server := newMockLLMService(t, content)
	defer server.Close()

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "example.md"), []byte("# Example\n\nSome content here."), 0644)

	err := BuildWorkspace(context.Background(), svc, dir, false, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	m, err := meta.LoadMeta(dir, "example.md")
	if err != nil {
		t.Fatalf("failed to load meta: %v", err)
	}
	if len(m.Keywords) != 4 {
		t.Fatalf("expected 4 keywords, got %d: %v", len(m.Keywords), m.Keywords)
	}
	if len(m.Aliases) != 2 {
		t.Fatalf("expected 2 aliases, got %d: %v", len(m.Aliases), m.Aliases)
	}
}

func TestGenerateMeta_InvalidJSONResponse(t *testing.T) {
	// Return non-JSON content from the mock LLM server
	svc, server := newMockLLMService(t, "This is not JSON at all!")
	defer server.Close()

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "broken.md"), []byte("# Broken"), 0644)

	var progresses []BuildProgress
	onProgress := func(p BuildProgress) {
		progresses = append(progresses, p)
	}

	err := BuildWorkspace(context.Background(), svc, dir, false, onProgress)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Expected: processing -> error (JSON parse failure) -> meta complete -> relation complete
	if len(progresses) != 4 {
		t.Fatalf("expected 4 progress events, got %d", len(progresses))
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
	if progresses[2].Status != "complete" || progresses[2].Phase != "meta" {
		t.Fatalf("progress[2]: expected meta complete, got status=%s phase=%s", progresses[2].Status, progresses[2].Phase)
	}
	if progresses[3].Status != "complete" || progresses[3].Phase != "relation" {
		t.Fatalf("progress[3]: expected relation complete, got status=%s phase=%s", progresses[3].Status, progresses[3].Phase)
	}
}

func TestGenerateMeta_CodeFencedJSONResponse(t *testing.T) {
	// Return valid JSON wrapped in code fences (common LLM behavior)
	inner := `{"summary":"A fenced response.","tags":["fenced"],"headings":[{"level":1,"text":"Fenced"}]}`
	content := "```json\n" + inner + "\n```"
	svc, server := newMockLLMService(t, content)
	defer server.Close()

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "fenced.md"), []byte("# Fenced"), 0644)

	err := BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {})
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
	content := `{"summary":"Updated summary.","tags":["updated"],"headings":[{"level":1,"text":"Updated"}]}`
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

	err := BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {})
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

// --- Incremental build tests ---

func TestBuildWorkspace_SkipsUnchangedFiles(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		resp := openaiResponse{
			ID: "test-id", Object: "chat.completion",
			Choices: []struct {
				Index   int `json:"index"`
				Message struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"message"`
				FinishReason string `json:"finish_reason"`
			}{{Index: 0, Message: struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			}{Role: "assistant", Content: `{"summary":"A doc.","tags":["test"],"headings":[{"level":1,"text":"Introduction"}]}`}, FinishReason: "stop"}},
			Usage: struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				TotalTokens      int `json:"total_tokens"`
			}{PromptTokens: 10, CompletionTokens: 20, TotalTokens: 30},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	svc := llm.NewService(t.TempDir())
	svc.UpdateModel(&llm.ActiveModelConfig{
		ID: "test", Model: "test-model", ApiURL: server.URL, ApiKey: "test-key",
	})

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte("# Doc"), 0644)

	// First build: should process the file
	err := BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {})
	if err != nil {
		t.Fatalf("first build: %v", err)
	}
	firstCallCount := callCount

	// Second build: should skip (content unchanged)
	var progresses []BuildProgress
	err = BuildWorkspace(context.Background(), svc, dir, false, func(p BuildProgress) {
		progresses = append(progresses, p)
	})
	if err != nil {
		t.Fatalf("second build: %v", err)
	}

	// No additional LLM calls
	if callCount != firstCallCount {
		t.Fatalf("expected no additional LLM calls, got %d total (was %d)", callCount, firstCallCount)
	}

	// Should have skipped status
	found := false
	for _, p := range progresses {
		if p.Status == "skipped" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected skipped status for unchanged file")
	}
}

func TestBuildWorkspace_ForceReprocessesUnchangedFile(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		resp := openaiResponse{
			ID: "test-id", Object: "chat.completion",
			Choices: []struct {
				Index   int `json:"index"`
				Message struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"message"`
				FinishReason string `json:"finish_reason"`
			}{{Index: 0, Message: struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			}{Role: "assistant", Content: `{"summary":"A doc.","tags":["test"],"headings":[{"level":1,"text":"Doc"}]}`}, FinishReason: "stop"}},
			Usage: struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				TotalTokens      int `json:"total_tokens"`
			}{PromptTokens: 10, CompletionTokens: 20, TotalTokens: 30},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	svc := llm.NewService(t.TempDir())
	svc.UpdateModel(&llm.ActiveModelConfig{
		ID: "test", Model: "test-model", ApiURL: server.URL, ApiKey: "test-key",
	})

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte("# Doc"), 0644)

	// First build: should process the file
	err := BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {})
	if err != nil {
		t.Fatalf("first build: %v", err)
	}
	firstCallCount := callCount

	// Second build with force=true: should reprocess even though content unchanged
	var progresses []BuildProgress
	err = BuildWorkspace(context.Background(), svc, dir, true, func(p BuildProgress) {
		progresses = append(progresses, p)
	})
	if err != nil {
		t.Fatalf("second build with force: %v", err)
	}

	// Should have additional LLM calls
	if callCount == firstCallCount {
		t.Fatal("expected additional LLM calls with force=true")
	}

	// Should have done status (not skipped)
	found := false
	for _, p := range progresses {
		if p.Status == "done" && p.Phase == "meta" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected done status for force reprocess")
	}
}

func TestBuildWorkspace_ReprocessesChangedFile(t *testing.T) {
	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		title := "Doc v1"
		if callCount > 1 {
			title = "Doc v2"
		}
		resp := openaiResponse{
			ID: "test-id", Object: "chat.completion",
			Choices: []struct {
				Index   int `json:"index"`
				Message struct {
					Role    string `json:"role"`
					Content string `json:"content"`
				} `json:"message"`
				FinishReason string `json:"finish_reason"`
			}{{Index: 0, Message: struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			}{Role: "assistant", Content: `{"summary":"A doc.","tags":["test"],"headings":[{"level":1,"text":"` + title + `"}]}`}, FinishReason: "stop"}},
			Usage: struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				TotalTokens      int `json:"total_tokens"`
			}{PromptTokens: 10, CompletionTokens: 20, TotalTokens: 30},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	svc := llm.NewService(t.TempDir())
	svc.UpdateModel(&llm.ActiveModelConfig{
		ID: "test", Model: "test-model", ApiURL: server.URL, ApiKey: "test-key",
	})

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte("# Doc v1"), 0644)

	// First build
	BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {})

	// Modify the file
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte("# Doc v2 - updated"), 0644)

	// Second build: should reprocess
	var progresses []BuildProgress
	BuildWorkspace(context.Background(), svc, dir, false, func(p BuildProgress) {
		progresses = append(progresses, p)
	})

	// Should have done status (not skipped)
	found := false
	for _, p := range progresses {
		if p.Status == "done" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected done status for changed file")
	}

	m, _ := meta.LoadMeta(dir, "doc.md")
	if m.Title != "Doc v2" {
		t.Fatalf("expected title 'Doc v2', got %q", m.Title)
	}
}

// --- selectVocabForDoc tests ---

func TestSelectVocabForDoc(t *testing.T) {
	cases := []struct {
		name     string
		vocab    map[string]int
		filename string
		max      int
		want     []string
	}{
		{
			name:     "empty vocab",
			vocab:    map[string]int{},
			filename: "doc.md",
			max:      200,
			want:     nil,
		},
		{
			name:     "count>=2 always kept",
			vocab:    map[string]int{"rest-api": 3, "pagination": 2},
			filename: "unrelated.md",
			max:      200,
			want:     []string{"rest-api", "pagination"},
		},
		{
			name:     "count==1 kept only on filename token match",
			vocab:    map[string]int{"unit-testing": 1, "obscure-tag": 1},
			filename: "unit-testing-guide.md",
			max:      200,
			want:     []string{"unit-testing"},
		},
		{
			name:     "count==1 token substring match",
			vocab:    map[string]int{"playwright-test": 1},
			filename: "playwright.md",
			max:      200,
			want:     []string{"playwright-test"},
		},
		{
			name:     "count==1 short token does not substring match",
			vocab:    map[string]int{"go": 1},
			filename: "golang-guide.md",
			max:      200,
			want:     nil,
		},
		{
			name:     "cap truncates by count desc",
			vocab:    map[string]int{"a": 5, "b": 3, "c": 1, "d": 2},
			filename: "d.md",
			max:      2,
			want:     []string{"a", "b"},
		},
		{
			name:     "zero max returns nil",
			vocab:    map[string]int{"a": 5},
			filename: "a.md",
			max:      0,
			want:     nil,
		},
	}
	for _, c := range cases {
		got := selectVocabForDoc(c.vocab, c.filename, c.max)
		if len(got) != len(c.want) {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("%s: got %v, want %v", c.name, got, c.want)
				break
			}
		}
	}
}

// --- tag vocabulary injection tests ---

func TestGenerateMeta_InjectsTagVocab(t *testing.T) {
	var capturedMessages []struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reqBody struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		json.NewDecoder(r.Body).Decode(&reqBody)

		isRelation := false
		for _, m := range reqBody.Messages {
			if strings.Contains(m.Content, "Evaluate how related it is to each") {
				isRelation = true
				break
			}
		}
		if isRelation {
			writeOpenAIResponse(t, w, `[]`)
			return
		}
		capturedMessages = reqBody.Messages
		writeOpenAIResponse(t, w, `{"summary":"New doc.","tags":["Rest_API","REST API","New Tag"],"keywords":[" kw ","kw","",""],"aliases":[" Alias ","Alias"],"headings":[{"level":1,"text":"New"}]}`)
	}))
	defer server.Close()

	svc := llm.NewService(t.TempDir())
	if err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID: "test", Model: "test-model", ApiURL: server.URL, ApiKey: "test-key",
	}); err != nil {
		t.Fatalf("failed to update model: %v", err)
	}

	dir := setupTestWorkspace(t)

	// Two pre-existing docs sharing "rest-api" give it count 2 in the vocab.
	// Their metas carry matching content hashes so the build skips them.
	for _, name := range []string{"old1.md", "old2.md"} {
		content := []byte("# Old")
		os.WriteFile(filepath.Join(dir, name), content, 0644)
		if err := meta.SaveMeta(dir, name, &meta.DocumentMeta{
			Title:       "Old",
			Tags:        []string{"rest-api"},
			Headings:    []meta.Heading{{Level: 1, Text: "Old"}},
			Status:      "active",
			ContentHash: computeHash(content),
		}); err != nil {
			t.Fatalf("save meta %s: %v", name, err)
		}
	}
	os.WriteFile(filepath.Join(dir, "new.md"), []byte("# New"), 0644)

	if err := BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// The fake must have received a system message plus a user prompt that
	// contains the vocabulary block.
	if len(capturedMessages) != 2 {
		t.Fatalf("expected 2 messages (system+user), got %d", len(capturedMessages))
	}
	if capturedMessages[0].Role != "system" {
		t.Fatalf("first message role = %q, want system", capturedMessages[0].Role)
	}
	prompt := capturedMessages[1].Content
	if !strings.Contains(prompt, "Existing tags in this knowledge base (prefer reusing):") {
		t.Fatalf("prompt missing vocab block:\n%s", prompt)
	}
	if !strings.Contains(prompt, "rest-api") {
		t.Fatalf("prompt missing vocab tag rest-api:\n%s", prompt)
	}
	if !strings.Contains(prompt, "Prefer tags from the existing vocabulary") {
		t.Fatalf("prompt missing reuse rule:\n%s", prompt)
	}

	// Output tags must be normalized and deduped; keywords/aliases trimmed.
	m, err := meta.LoadMeta(dir, "new.md")
	if err != nil {
		t.Fatalf("load meta: %v", err)
	}
	wantTags := []string{"rest-api", "new-tag"}
	if len(m.Tags) != len(wantTags) {
		t.Fatalf("tags = %v, want %v", m.Tags, wantTags)
	}
	for i := range wantTags {
		if m.Tags[i] != wantTags[i] {
			t.Fatalf("tags = %v, want %v", m.Tags, wantTags)
		}
	}
	if len(m.Keywords) != 1 || m.Keywords[0] != "kw" {
		t.Fatalf("keywords = %v, want [kw]", m.Keywords)
	}
	if len(m.Aliases) != 1 || m.Aliases[0] != "Alias" {
		t.Fatalf("aliases = %v, want [Alias]", m.Aliases)
	}
}

func TestGenerateMeta_NoVocabBlockWhenEmpty(t *testing.T) {
	var captured string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var reqBody struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		json.NewDecoder(r.Body).Decode(&reqBody)
		for _, m := range reqBody.Messages {
			if strings.Contains(m.Content, "Analyze the following markdown document") {
				captured = m.Content
			}
		}
		writeOpenAIResponse(t, w, `{"summary":"A doc.","tags":["test"],"headings":[{"level":1,"text":"Doc"}]}`)
	}))
	defer server.Close()

	svc := llm.NewService(t.TempDir())
	if err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID: "test", Model: "test-model", ApiURL: server.URL, ApiKey: "test-key",
	}); err != nil {
		t.Fatalf("failed to update model: %v", err)
	}

	dir := setupTestWorkspace(t)
	os.WriteFile(filepath.Join(dir, "doc.md"), []byte("# Doc"), 0644)

	if err := BuildWorkspace(context.Background(), svc, dir, false, func(BuildProgress) {}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if captured == "" {
		t.Fatal("did not capture meta prompt")
	}
	if strings.Contains(captured, "Existing tags in this knowledge base") {
		t.Fatalf("prompt should not contain vocab block when vocab is empty:\n%s", captured)
	}
}

// --- computeHash tests ---

func TestComputeHash(t *testing.T) {
	h1 := computeHash([]byte("hello"))
	h2 := computeHash([]byte("hello"))
	h3 := computeHash([]byte("world"))

	if h1 != h2 {
		t.Fatal("same content should produce same hash")
	}
	if h1 == h3 {
		t.Fatal("different content should produce different hash")
	}
}

// --- findCandidateDocs tests ---

func TestFindCandidateDocs_NoSharedTags(t *testing.T) {
	metas := []*meta.DocumentMeta{
		{Path: "a.md", Tags: []string{"go"}},
		{Path: "b.md", Tags: []string{"python"}},
	}
	changed := map[string]bool{"a.md": true}

	result := findCandidateDocs(metas, changed)
	if len(result) != 0 {
		t.Fatalf("expected 0 entries, got %d", len(result))
	}
}

func TestFindCandidateDocs_SharedTags(t *testing.T) {
	metas := []*meta.DocumentMeta{
		{Path: "a.md", Tags: []string{"go", "api"}},
		{Path: "b.md", Tags: []string{"go", "testing"}},
		{Path: "c.md", Tags: []string{"python"}},
	}
	changed := map[string]bool{"a.md": true}

	result := findCandidateDocs(metas, changed)
	candidates, ok := result["a.md"]
	if !ok {
		t.Fatal("expected entry for a.md")
	}
	if len(candidates) != 1 {
		t.Fatalf("expected 1 candidate for a.md, got %d", len(candidates))
	}
	if candidates[0].path != "b.md" {
		t.Fatalf("expected candidate path 'b.md', got %s", candidates[0].path)
	}
	found := false
	for _, tag := range candidates[0].sharedTags {
		if tag == "go" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected shared tag 'go', got %v", candidates[0].sharedTags)
	}
}

func TestFindCandidateDocs_SkipsUnchangedPairs(t *testing.T) {
	metas := []*meta.DocumentMeta{
		{Path: "a.md", Tags: []string{"go"}},
		{Path: "b.md", Tags: []string{"go"}},
		{Path: "c.md", Tags: []string{"go"}},
	}
	changed := map[string]bool{"a.md": true}

	result := findCandidateDocs(metas, changed)
	// Only candidates involving a.md: b and c. b↔c should be skipped.
	if len(result["a.md"]) != 2 {
		t.Fatalf("expected 2 candidates for a.md, got %d", len(result["a.md"]))
	}
}

func TestFindCandidateDocs_NoChangedDocs(t *testing.T) {
	metas := []*meta.DocumentMeta{
		{Path: "a.md", Tags: []string{"go"}},
		{Path: "b.md", Tags: []string{"go"}},
	}
	changed := map[string]bool{}

	result := findCandidateDocs(metas, changed)
	if len(result) != 0 {
		t.Fatalf("expected 0 entries with no changed docs, got %d", len(result))
	}
}

func TestFindCandidateDocs_TagMatch(t *testing.T) {
	allMetas := []*meta.DocumentMeta{
		{Path: "a.md", Tags: []string{"go", "api"}},
		{Path: "b.md", Tags: []string{"go", "cli"}},
		{Path: "c.md", Tags: []string{"python"}},
	}
	changed := map[string]bool{"a.md": true}
	result := findCandidateDocs(allMetas, changed)
	if len(result["a.md"]) != 1 {
		t.Fatalf("expected 1 candidate for a.md, got %d", len(result["a.md"]))
	}
	if result["a.md"][0].path != "b.md" {
		t.Fatalf("expected b.md as candidate, got %s", result["a.md"][0].path)
	}
}

// --- analyzeDocRelations tests ---

// newMockRelationLLMService creates a mock HTTP server that returns different
// responses based on call count. This allows testing retry and filter behaviors.
func newMockRelationLLMService(t *testing.T, handler http.HandlerFunc) (*llm.Service, *httptest.Server) {
	t.Helper()

	server := httptest.NewServer(handler)
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

// writeOpenAIResponse writes a standard OpenAI-format chat completion response.
func writeOpenAIResponse(t *testing.T, w http.ResponseWriter, content string) {
	t.Helper()

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
					Content: content,
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
}

// TestAnalyzeDocRelations_RetryPath verifies that when the first LLM response
// is missing a candidate, the retry mechanism supplements the result and all
// candidates are covered.
func TestAnalyzeDocRelations_RetryPath(t *testing.T) {
	callCount := 0
	svc, server := newMockRelationLLMService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++

		// Decode the request body to determine if this is a retry call
		var reqBody struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		json.NewDecoder(r.Body).Decode(&reqBody)

		// Retry calls have 3 messages (user, assistant, user)
		isRetry := len(reqBody.Messages) == 3

		if isRetry {
			// Second call: supplement the missing candidate
			writeOpenAIResponse(t, w, `[{"target":"c.md","score":0.7,"reason":"both about testing"}]`)
		} else {
			// First call: return only 1 of 2 candidates (missing c.md)
			writeOpenAIResponse(t, w, `[{"target":"b.md","score":0.8,"reason":"both about go"}]`)
		}
	}))
	defer server.Close()

	candidates := []candidateInfo{
		{path: "b.md", sharedTags: []string{"go"}},
		{path: "c.md", sharedTags: []string{"testing"}},
	}

	metaMap := map[string]*meta.DocumentMeta{
		"a.md": {Path: "a.md", Summary: "Doc A summary", Tags: []string{"go", "testing"}},
		"b.md": {Path: "b.md", Summary: "Doc B summary", Tags: []string{"go", "api"}},
		"c.md": {Path: "c.md", Summary: "Doc C summary", Tags: []string{"testing", "unit"}},
	}

	relations, err := analyzeDocRelations(context.Background(), svc, "a.md", candidates, metaMap)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have made 2 calls: initial + 1 retry
	if callCount != 2 {
		t.Fatalf("expected 2 LLM calls (initial + retry), got %d", callCount)
	}

	// Both candidates should be present in the results
	if len(relations) != 2 {
		t.Fatalf("expected 2 relations, got %d", len(relations))
	}

	foundB, foundC := false, false
	for _, r := range relations {
		if r.Target == "b.md" {
			foundB = true
			if r.Score != 0.8 {
				t.Fatalf("expected score 0.8 for b.md, got %f", r.Score)
			}
		}
		if r.Target == "c.md" {
			foundC = true
			if r.Score != 0.7 {
				t.Fatalf("expected score 0.7 for c.md, got %f", r.Score)
			}
		}
	}
	if !foundB {
		t.Fatal("expected relation for b.md")
	}
	if !foundC {
		t.Fatal("expected relation for c.md (added via retry)")
	}
}

// TestAnalyzeDocRelations_ScoreFilter verifies that relations with score < 0.3
// are filtered out from the results.
func TestAnalyzeDocRelations_ScoreFilter(t *testing.T) {
	svc, server := newMockRelationLLMService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return one high-score and one low-score relation
		writeOpenAIResponse(t, w, `[
			{"target":"b.md","score":0.9,"reason":"highly related"},
			{"target":"c.md","score":0.1,"reason":"barely related"}
		]`)
	}))
	defer server.Close()

	candidates := []candidateInfo{
		{path: "b.md", sharedTags: []string{"go"}},
		{path: "c.md", sharedTags: []string{"api"}},
	}

	metaMap := map[string]*meta.DocumentMeta{
		"a.md": {Path: "a.md", Summary: "Doc A", Tags: []string{"go", "api"}},
		"b.md": {Path: "b.md", Summary: "Doc B", Tags: []string{"go"}},
		"c.md": {Path: "c.md", Summary: "Doc C", Tags: []string{"api"}},
	}

	relations, err := analyzeDocRelations(context.Background(), svc, "a.md", candidates, metaMap)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Only the high-score relation should survive
	if len(relations) != 1 {
		t.Fatalf("expected 1 relation (low score filtered), got %d", len(relations))
	}
	if relations[0].Target != "b.md" {
		t.Fatalf("expected target b.md, got %s", relations[0].Target)
	}
	if relations[0].Score != 0.9 {
		t.Fatalf("expected score 0.9, got %f", relations[0].Score)
	}
}

// TestAnalyzeDocRelations_HallucinatedTarget verifies that when the LLM returns
// a target path that does not exist in the candidate list, it is filtered out.
func TestAnalyzeDocRelations_HallucinatedTarget(t *testing.T) {
	svc, server := newMockRelationLLMService(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Return one valid target and one hallucinated target
		writeOpenAIResponse(t, w, `[
			{"target":"b.md","score":0.8,"reason":"valid relation"},
			{"target":"phantom.md","score":0.9,"reason":"hallucinated target"}
		]`)
	}))
	defer server.Close()

	candidates := []candidateInfo{
		{path: "b.md", sharedTags: []string{"go"}},
	}

	metaMap := map[string]*meta.DocumentMeta{
		"a.md": {Path: "a.md", Summary: "Doc A", Tags: []string{"go"}},
		"b.md": {Path: "b.md", Summary: "Doc B", Tags: []string{"go"}},
	}

	relations, err := analyzeDocRelations(context.Background(), svc, "a.md", candidates, metaMap)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Only the valid target should survive
	if len(relations) != 1 {
		t.Fatalf("expected 1 relation (hallucinated target filtered), got %d", len(relations))
	}
	if relations[0].Target != "b.md" {
		t.Fatalf("expected target b.md, got %s", relations[0].Target)
	}
}
