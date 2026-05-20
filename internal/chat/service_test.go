package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/cloudwego/eino/callbacks"
	"github.com/cloudwego/eino/components/model"
	einoschema "github.com/cloudwego/eino/schema"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"mindstack/internal/llm"
)

func TestMain(m *testing.M) {
	// Disable Wails runtime calls in tests (invalid context causes process exit).
	logInfof = func(ctx context.Context, format string, args ...interface{}) {}
	logErrorf = func(ctx context.Context, format string, args ...interface{}) {}
	logError = func(ctx context.Context, msg string) {}
	eventsEmit = func(ctx context.Context, eventName string, optionalData ...interface{}) {}
	os.Exit(m.Run())
}

// mockLLM implements llmProvider for testing.
type mockLLM struct {
	countTokensFn      func(text string) int
	getContextWindowFn func() int
	chatFn             func(ctx context.Context, messages []*einoschema.Message) (string, error)
}

func (m *mockLLM) CountTokens(text string) int {
	if m.countTokensFn != nil {
		return m.countTokensFn(text)
	}
	return len(text) / 4
}

func (m *mockLLM) GetContextWindow() int {
	if m.getContextWindowFn != nil {
		return m.getContextWindowFn()
	}
	return 128000
}

func (m *mockLLM) Chat(ctx context.Context, messages []*einoschema.Message) (string, error) {
	if m.chatFn != nil {
		return m.chatFn(ctx, messages)
	}
	return "summary", nil
}

// -------------------------------------------------------
// doCompressMessages
// -------------------------------------------------------

func TestDoCompressMessages_NoCompressionNeeded(t *testing.T) {
	llm := &mockLLM{
		countTokensFn:      func(text string) int { return len(text) / 4 },
		getContextWindowFn: func() int { return 10000 },
	}

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: "hello"},
		{Role: einoschema.Assistant, Content: "hi"},
	}

	result, err := doCompressMessages(context.Background(), llm, messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(result))
	}
}

func TestDoCompressMessages_ContextWindowZero(t *testing.T) {
	llm := &mockLLM{
		getContextWindowFn: func() int { return 0 },
	}

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: strings.Repeat("a", 10000)},
	}

	result, err := doCompressMessages(context.Background(), llm, messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 message, got %d", len(result))
	}
}

func TestDoCompressMessages_CompressesOldMessages(t *testing.T) {
	llm := &mockLLM{
		countTokensFn:      func(text string) int { return len(text) },
		getContextWindowFn: func() int { return 100 },
		chatFn: func(ctx context.Context, messages []*einoschema.Message) (string, error) {
			return "conversation summary", nil
		},
	}

	// 6 chat messages + 1 system = 7 total, each 20 tokens = 140 tokens
	// threshold = 80, so compression needed
	messages := []*einoschema.Message{
		{Role: einoschema.System, Content: "system prompt"},
		{Role: einoschema.User, Content: strings.Repeat("a", 20)},
		{Role: einoschema.Assistant, Content: strings.Repeat("b", 20)},
		{Role: einoschema.User, Content: strings.Repeat("c", 20)},
		{Role: einoschema.Assistant, Content: strings.Repeat("d", 20)},
		{Role: einoschema.User, Content: strings.Repeat("e", 20)},
		{Role: einoschema.Assistant, Content: strings.Repeat("f", 20)},
	}

	result, err := doCompressMessages(context.Background(), llm, messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have: system + summary system + 4 recent chat messages = 6
	if len(result) != 6 {
		t.Fatalf("expected 6 messages after compression, got %d: %+v", len(result), result)
	}

	// First message should be the original system prompt
	if result[0].Role != einoschema.System || result[0].Content != "system prompt" {
		t.Fatalf("expected original system prompt first, got %s: %s", result[0].Role, result[0].Content)
	}

	// Second message should be the summary
	if result[1].Role != einoschema.System {
		t.Fatalf("expected summary system message second, got %s", result[1].Role)
	}
	if !strings.Contains(result[1].Content, "conversation summary") {
		t.Fatalf("expected summary content, got %s", result[1].Content)
	}

	// Last 4 should be the preserved chat messages
	if result[2].Content != strings.Repeat("c", 20) {
		t.Fatalf("expected preserved message c, got %s", result[2].Content)
	}
}

func TestDoCompressMessages_TooFewMessages(t *testing.T) {
	llm := &mockLLM{
		countTokensFn:      func(text string) int { return len(text) },
		getContextWindowFn: func() int { return 10 },
	}

	// Only 2 chat messages, should not compress
	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: strings.Repeat("a", 10)},
		{Role: einoschema.Assistant, Content: strings.Repeat("b", 10)},
	}

	result, err := doCompressMessages(context.Background(), llm, messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 2 {
		t.Fatalf("expected 2 messages (no compression), got %d", len(result))
	}
}

func TestDoCompressMessages_SummaryError(t *testing.T) {
	llm := &mockLLM{
		countTokensFn:      func(text string) int { return len(text) },
		getContextWindowFn: func() int { return 100 },
		chatFn: func(ctx context.Context, messages []*einoschema.Message) (string, error) {
			return "", fmt.Errorf("api error")
		},
	}

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: strings.Repeat("a", 20)},
		{Role: einoschema.Assistant, Content: strings.Repeat("b", 20)},
		{Role: einoschema.User, Content: strings.Repeat("c", 20)},
		{Role: einoschema.Assistant, Content: strings.Repeat("d", 20)},
		{Role: einoschema.User, Content: strings.Repeat("e", 20)},
		{Role: einoschema.Assistant, Content: strings.Repeat("f", 20)},
	}

	_, err := doCompressMessages(context.Background(), llm, messages)
	if err == nil {
		t.Fatal("expected error when summarization fails")
	}
	if !strings.Contains(err.Error(), "summarize messages") {
		t.Fatalf("expected 'summarize messages' in error, got: %v", err)
	}
}

func TestDoCompressMessages_RecursiveCompression(t *testing.T) {
	callCount := 0
	llm := &mockLLM{
		countTokensFn: func(text string) int {
			// Summary message counts as 5 tokens
			if strings.Contains(text, "[Earlier conversation summary]") {
				return 5
			}
			return len(text)
		},
		getContextWindowFn: func() int { return 50 },
		chatFn: func(ctx context.Context, messages []*einoschema.Message) (string, error) {
			callCount++
			return fmt.Sprintf("summary round %d", callCount), nil
		},
	}

	// Many long messages that require multiple compression rounds
	var messages []*einoschema.Message
	for i := 0; i < 20; i++ {
		role := einoschema.User
		if i%2 == 1 {
			role = einoschema.Assistant
		}
		messages = append(messages, &einoschema.Message{
			Role:    role,
			Content: strings.Repeat(string(rune('a'+i)), 10),
		})
	}

	result, err := doCompressMessages(context.Background(), llm, messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should have compressed enough to get below threshold
	// Result should have summary messages + at least 4 recent messages
	if len(result) < 4 {
		t.Fatalf("expected at least 4 messages after recursive compression, got %d", len(result))
	}

	// Should have made multiple summary calls
	if callCount < 1 {
		t.Fatalf("expected at least 1 summary call, got %d", callCount)
	}
}

// -------------------------------------------------------
// doSummarizeMessages
// -------------------------------------------------------

func TestDoSummarizeMessages_TruncatesLongContent(t *testing.T) {
	var capturedUserContent string
	llm := &mockLLM{
		chatFn: func(ctx context.Context, messages []*einoschema.Message) (string, error) {
			for _, m := range messages {
				if m.Role == einoschema.User {
					capturedUserContent = m.Content
				}
			}
			return "summary", nil
		},
	}

	longContent := strings.Repeat("a", 5000)
	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: longContent},
	}

	_, err := doSummarizeMessages(context.Background(), llm, messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Content should be truncated to 4000 runes + marker
	if !strings.Contains(capturedUserContent, "... [truncated]") {
		t.Fatal("expected long content to be truncated")
	}
}

func TestDoSummarizeMessages_ChatError(t *testing.T) {
	llm := &mockLLM{
		chatFn: func(ctx context.Context, messages []*einoschema.Message) (string, error) {
			return "", fmt.Errorf("llm api failed")
		},
	}

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: "hello"},
	}

	_, err := doSummarizeMessages(context.Background(), llm, messages)
	if err == nil {
		t.Fatal("expected error when LLM chat fails")
	}
	if !strings.Contains(err.Error(), "llm api failed") {
		t.Fatalf("expected 'llm api failed' in error, got: %v", err)
	}
}

func TestDoSummarizeMessages_PromptConstruction(t *testing.T) {
	var capturedMessages []*einoschema.Message
	llm := &mockLLM{
		chatFn: func(ctx context.Context, messages []*einoschema.Message) (string, error) {
			capturedMessages = messages
			return "test summary", nil
		},
	}

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: "user message"},
		{Role: einoschema.Assistant, Content: "assistant response"},
	}

	summary, err := doSummarizeMessages(context.Background(), llm, messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary != "test summary" {
		t.Fatalf("expected 'test summary', got %q", summary)
	}

	// Should send a system prompt + user prompt with the conversation
	if len(capturedMessages) != 2 {
		t.Fatalf("expected 2 messages to LLM, got %d", len(capturedMessages))
	}
	if capturedMessages[0].Role != einoschema.System {
		t.Fatalf("expected first message to be system, got %s", capturedMessages[0].Role)
	}
	if capturedMessages[1].Role != einoschema.User {
		t.Fatalf("expected second message to be user, got %s", capturedMessages[1].Role)
	}
	if !strings.Contains(capturedMessages[1].Content, "user message") {
		t.Fatal("expected user message in summary prompt")
	}
	if !strings.Contains(capturedMessages[1].Content, "assistant response") {
		t.Fatal("expected assistant response in summary prompt")
	}
}

// -------------------------------------------------------
// compressMessages / summarizeMessages (wrapper methods)
// -------------------------------------------------------

func TestCompressMessages_NoCompression(t *testing.T) {
	llmSvc := llm.NewService("dummy")
	svc := &Service{
		ctx: context.Background(),
		llm: llmSvc,
	}

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: "hello"},
	}

	result, err := svc.compressMessages(messages)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 message, got %d", len(result))
	}
}

func TestSummarizeMessages_NoModel(t *testing.T) {
	llmSvc := llm.NewService("dummy")
	svc := &Service{
		ctx: context.Background(),
		llm: llmSvc,
	}

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: "hello"},
	}

	_, err := svc.summarizeMessages(messages)
	if err == nil {
		t.Fatal("expected error when no model configured")
	}
}

// -------------------------------------------------------
// truncateTitle
// -------------------------------------------------------

func TestTruncateTitle_ShortText(t *testing.T) {
	short := "Hello world"
	result := truncateTitle(short)
	if result != short {
		t.Fatalf("expected %q, got %q", short, result)
	}
}

func TestTruncateTitle_LongText(t *testing.T) {
	long := strings.Repeat("a", 60)
	result := truncateTitle(long)
	expected := strings.Repeat("a", 50) + "..."
	if result != expected {
		t.Fatalf("expected %q, got %q", expected, result)
	}
}

func TestTruncateTitle_Exactly50Runes(t *testing.T) {
	text := strings.Repeat("a", 50)
	result := truncateTitle(text)
	if result != text {
		t.Fatalf("expected %q, got %q", text, result)
	}
}

func TestTruncateTitle_UnicodeRunes(t *testing.T) {
	// Each Chinese character is one rune
	text := strings.Repeat("中", 60)
	result := truncateTitle(text)
	expected := strings.Repeat("中", 50) + "..."
	if result != expected {
		t.Fatalf("expected %q, got %q", expected, result)
	}
}

// -------------------------------------------------------
// jsonError
// -------------------------------------------------------

func TestJSONError(t *testing.T) {
	result := jsonError("something went wrong")
	var parsed map[string]string
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("expected valid JSON, got error: %v", err)
	}
	if parsed["error"] != "something went wrong" {
		t.Fatalf("expected error message, got %q", parsed["error"])
	}
}

// -------------------------------------------------------
// jsonOK
// -------------------------------------------------------

func TestJSONOK(t *testing.T) {
	result := jsonOK("sessionId", 42)
	var parsed map[string]any
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("expected valid JSON, got error: %v", err)
	}
	if parsed["ok"] != true {
		t.Fatalf("expected ok=true, got %v", parsed["ok"])
	}
	if parsed["sessionId"] != float64(42) {
		t.Fatalf("expected sessionId=42, got %v", parsed["sessionId"])
	}
}

// -------------------------------------------------------
// NewService, Init, SetContext
// -------------------------------------------------------

func TestNewService(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.store == nil {
		t.Fatal("expected store to be set")
	}
	if svc.llm != llmSvc {
		t.Fatal("expected llm to be set")
	}
}

func TestInit(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	if err := svc.Init(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Verify tables were created by attempting a write
	session, err := svc.store.CreateSession("/tmp", "test")
	if err != nil {
		t.Fatalf("expected tables to exist after Init, got error: %v", err)
	}
	if session.ID == 0 {
		t.Fatal("expected session to have an ID")
	}
}

func TestSetContext(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	ctx := context.WithValue(context.Background(), "key", "value")
	svc.SetContext(ctx)
	if svc.ctx != ctx {
		t.Fatal("expected context to be set")
	}
}

// -------------------------------------------------------
// CreateSession
// -------------------------------------------------------

func TestCreateSession_Success(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	_ = svc.Init()

	result := svc.CreateSession("/workspace")
	var session ChatSession
	if err := json.Unmarshal([]byte(result), &session); err != nil {
		t.Fatalf("expected valid JSON, got error: %v", err)
	}
	if session.ID == 0 {
		t.Fatal("expected session to have an ID")
	}
	if session.WorkspacePath != "/workspace" {
		t.Fatalf("expected workspace /workspace, got %q", session.WorkspacePath)
	}
	if session.Title != "New Chat" {
		t.Fatalf("expected title 'New Chat', got %q", session.Title)
	}
}

func TestCreateSession_Error(t *testing.T) {
	// Create a service without calling Init so the table doesn't exist
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)

	result := svc.CreateSession("/workspace")
	var parsed map[string]string
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("expected valid JSON, got error: %v", err)
	}
	if parsed["error"] == "" {
		t.Fatal("expected error field in response")
	}
}

// -------------------------------------------------------
// ListSessions
// -------------------------------------------------------

func TestListSessions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	_ = svc.Init()

	_, _ = svc.store.CreateSession("/workspace", "Chat 1")
	_, _ = svc.store.CreateSession("/workspace", "Chat 2")
	_, _ = svc.store.CreateSession("/other", "Chat 3")

	result := svc.ListSessions("/workspace")
	var sessions []ChatSession
	if err := json.Unmarshal([]byte(result), &sessions); err != nil {
		t.Fatalf("expected valid JSON, got error: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}
}

// -------------------------------------------------------
// GetSessionHistory
// -------------------------------------------------------

func TestGetSessionHistory(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	_ = svc.Init()

	session, _ := svc.store.CreateSession("/workspace", "Chat")
	_, _ = svc.store.AddMessage(session.ID, "user", "hello")
	_, _ = svc.store.AddMessage(session.ID, "assistant", "hi there")

	result := svc.GetSessionHistory(session.ID)
	var messages []ChatMessage
	if err := json.Unmarshal([]byte(result), &messages); err != nil {
		t.Fatalf("expected valid JSON, got error: %v", err)
	}
	if len(messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(messages))
	}
	if messages[0].Role != "user" || messages[0].Content != "hello" {
		t.Fatalf("expected first message from user, got %+v", messages[0])
	}
	if messages[1].Role != "assistant" || messages[1].Content != "hi there" {
		t.Fatalf("expected second message from assistant, got %+v", messages[1])
	}
}

// -------------------------------------------------------
// DeleteSession
// -------------------------------------------------------

func TestDeleteSession(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	_ = svc.Init()

	session, _ := svc.store.CreateSession("/workspace", "Chat")

	result := svc.DeleteSession(session.ID)
	if result != `{"ok":true}` {
		t.Fatalf("expected ok response, got %q", result)
	}

	// Verify deletion
	_, err = svc.store.GetSession(session.ID)
	if err == nil {
		t.Fatal("expected session to be deleted")
	}
}

// -------------------------------------------------------
// UpdateSessionTitle
// -------------------------------------------------------

func TestUpdateSessionTitle(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	_ = svc.Init()

	session, _ := svc.store.CreateSession("/workspace", "Old Title")

	result := svc.UpdateSessionTitle(session.ID, "New Title")
	if result != `{"ok":true}` {
		t.Fatalf("expected ok response, got %q", result)
	}

	updated, _ := svc.store.GetSession(session.ID)
	if updated.Title != "New Title" {
		t.Fatalf("expected title 'New Title', got %q", updated.Title)
	}
}

// -------------------------------------------------------
// buildSystemPrompt
// -------------------------------------------------------

func TestBuildSystemPrompt_Base(t *testing.T) {
	result := buildSystemPrompt("", "", 0, 0, "")
	if !strings.Contains(result, "You are a helpful AI assistant") {
		t.Fatal("expected base prompt")
	}
}

func TestBuildSystemPrompt_WithFile(t *testing.T) {
	result := buildSystemPrompt("", "", 0, 0, "/docs/readme.md")
	if !strings.Contains(result, "readme.md") {
		t.Fatal("expected file name")
	}
	if !strings.Contains(result, "/docs/readme.md") {
		t.Fatal("expected full path")
	}
}

func TestBuildSystemPrompt_WithContent(t *testing.T) {
	result := buildSystemPrompt("hello world", "", 0, 0, "")
	if !strings.Contains(result, "File content:") {
		t.Fatal("expected file content section")
	}
	if !strings.Contains(result, "hello world") {
		t.Fatal("expected content in prompt")
	}
}

func TestBuildSystemPrompt_WithLongContent(t *testing.T) {
	longContent := strings.Repeat("a", 10000)
	result := buildSystemPrompt(longContent, "", 0, 0, "")
	if !strings.Contains(result, "... [truncated]") {
		t.Fatal("expected truncation marker")
	}
}

func TestBuildSystemPrompt_WithSelection(t *testing.T) {
	result := buildSystemPrompt("", "selected text", 10, 25, "")
	if !strings.Contains(result, "Selected text") {
		t.Fatal("expected selection section")
	}
	if !strings.Contains(result, "10-25") {
		t.Fatal("expected positions")
	}
	if !strings.Contains(result, "selected text") {
		t.Fatal("expected selected content")
	}
}

func TestBuildSystemPrompt_Combined(t *testing.T) {
	result := buildSystemPrompt("content", "sel", 1, 2, "/f.md")
	if !strings.Contains(result, "Current context:") {
		t.Fatal("expected file context")
	}
	if !strings.Contains(result, "File content:") {
		t.Fatal("expected content section")
	}
	if !strings.Contains(result, "Selected text") {
		t.Fatal("expected selection section")
	}
}

// -------------------------------------------------------
// editTool
// -------------------------------------------------------

func TestEditTool_Info(t *testing.T) {
	tool := &editTool{}
	info, err := tool.Info(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info != editToolInfo {
		t.Fatal("expected editToolInfo")
	}
}

func TestEditTool_InvokableRun_ValidJSON(t *testing.T) {
	tool := &editTool{}
	args := `{"changes":[{"search":"old","replace":"new","position":"all"}],"explanation":"test"}`
	result, err := tool.InvokableRun(context.Background(), args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "_tool_result") {
		t.Fatal("expected tool result marker")
	}
	if !strings.Contains(result, `"tool":"edit"`) {
		t.Fatal("expected tool name")
	}
}

func TestEditTool_InvokableRun_UnescapedNewlines(t *testing.T) {
	tool := &editTool{}
	args := `{"changes":[{"search":"a\nb","replace":"c","position":"all"}],"explanation":"test"}`
	result, err := tool.InvokableRun(context.Background(), args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(result, "_tool_result") {
		t.Fatal("expected tool result marker")
	}
}

func TestEditTool_InvokableRun_InvalidJSON(t *testing.T) {
	tool := &editTool{}
	_, err := tool.InvokableRun(context.Background(), "not json")
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

// -------------------------------------------------------
// StreamChatWithHistory
// -------------------------------------------------------

func TestStreamChatWithHistory_ParseError(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	svc := NewService(db, llm.NewService("dummy"))
	result := svc.StreamChatWithHistory("invalid json")
	if !strings.Contains(result, "parse request") {
		t.Fatalf("expected parse error, got %q", result)
	}
}

func TestStreamChatWithHistory_CreateSession(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	svc := NewService(db, llm.NewService("dummy"))
	_ = svc.Init()

	req := `{"sessionId":0,"workspacePath":"/workspace","userMessage":"hello"}`
	result := svc.StreamChatWithHistory(req)
	if !strings.Contains(result, `"sessionId"`) {
		t.Fatalf("expected sessionId in response, got %q", result)
	}
	if !strings.Contains(result, `"status":"streaming"`) {
		t.Fatalf("expected streaming status, got %q", result)
	}
}

func TestStreamChatWithHistory_ExistingSession(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	svc := NewService(db, llm.NewService("dummy"))
	_ = svc.Init()

	session, _ := svc.store.CreateSession("/workspace", "Chat")
	_, _ = svc.store.AddMessage(session.ID, "user", "previous")

	req := fmt.Sprintf(`{"sessionId":%d,"workspacePath":"/workspace","userMessage":"follow up"}`, session.ID)
	result := svc.StreamChatWithHistory(req)
	if !strings.Contains(result, fmt.Sprintf(`"sessionId":%d`, session.ID)) {
		t.Fatalf("expected sessionId %d in response, got %q", session.ID, result)
	}
}

func TestStreamChatWithHistory_SaveMessageError(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	svc := NewService(db, llm.NewService("dummy"))
	// No Init() - table doesn't exist

	req := `{"sessionId":0,"workspacePath":"/workspace","userMessage":"hello"}`
	result := svc.StreamChatWithHistory(req)
	if !strings.Contains(result, "save message") && !strings.Contains(result, "create session") {
		t.Fatalf("expected error response, got %q", result)
	}
}

// -------------------------------------------------------
// streamPlainChat
// -------------------------------------------------------

func TestStreamPlainChat_NoModel(t *testing.T) {
	origEmit := eventsEmit
	origLogErr := logErrorf
	eventsEmit = func(ctx context.Context, eventName string, optionalData ...interface{}) {}
	logErrorf = func(ctx context.Context, format string, args ...interface{}) {}
	defer func() {
		eventsEmit = origEmit
		logErrorf = origLogErr
	}()

	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	svc := NewService(db, llm.NewService("dummy"))
	_ = svc.Init()
	svc.SetContext(context.Background())

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: "hello"},
	}

	// No model configured - StreamChat returns error, covering error path
	svc.streamPlainChat(1, messages)
}

func TestStreamPlainChat_CompressError(t *testing.T) {
	// Disable Wails runtime calls
	origEmit := eventsEmit
	origLogErr := logErrorf
	eventsEmit = func(ctx context.Context, eventName string, optionalData ...interface{}) {}
	logErrorf = func(ctx context.Context, format string, args ...interface{}) {}
	defer func() {
		eventsEmit = origEmit
		logErrorf = origLogErr
	}()

	// Force a low context window so compression is triggered with few messages
	t.Setenv("MINDSTACK_DEBUG_CONTEXT_WINDOW", "10")

	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	svc := NewService(db, llm.NewService("dummy"))
	_ = svc.Init()
	svc.SetContext(context.Background())

	// Create enough messages to exceed the tiny threshold
	// Each "hello world" is ~3 tokens, 4 messages = ~12 tokens > threshold (8)
	// But we need at least 5 chat messages to trigger compression (chatMsgs > 4)
	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: "hello world first message"},
		{Role: einoschema.Assistant, Content: "response one"},
		{Role: einoschema.User, Content: "hello world second message"},
		{Role: einoschema.Assistant, Content: "response two"},
		{Role: einoschema.User, Content: "hello world third message"},
		{Role: einoschema.Assistant, Content: "response three"},
	}

	// Compression will be triggered but llm.Chat returns "no model configured",
	// covering the compress error handling path in streamPlainChat
	svc.streamPlainChat(1, messages)
}

// -------------------------------------------------------
// streamChunkEmitter callbacks
// -------------------------------------------------------

func TestStreamChunkEmitter_OnStart(t *testing.T) {
	e := &streamChunkEmitter{}
	ctx := e.OnStart(context.Background(), nil, nil)
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
}

func TestStreamChunkEmitter_OnEnd_NilOutput(t *testing.T) {
	e := &streamChunkEmitter{}
	ctx := e.OnEnd(context.Background(), nil, nil)
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
}

func TestStreamChunkEmitter_OnError(t *testing.T) {
	e := &streamChunkEmitter{}
	ctx := e.OnError(context.Background(), nil, fmt.Errorf("test"))
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
}

func TestStreamChunkEmitter_Needed(t *testing.T) {
	e := &streamChunkEmitter{}
	// info=nil returns false
	if e.Needed(context.Background(), nil, 0) {
		t.Fatal("expected Needed to return false when info is nil")
	}
	// Valid timing returns true
	info := &callbacks.RunInfo{}
	if !e.Needed(context.Background(), info, callbacks.TimingOnEnd) {
		t.Fatal("expected Needed to return true for TimingOnEnd")
	}
	if !e.Needed(context.Background(), info, callbacks.TimingOnEndWithStreamOutput) {
		t.Fatal("expected Needed to return true for TimingOnEndWithStreamOutput")
	}
	if e.Needed(context.Background(), info, callbacks.TimingOnStart) {
		t.Fatal("expected Needed to return false for TimingOnStart")
	}
}

func TestStreamChunkEmitter_OnStartWithStreamInput(t *testing.T) {
	e := &streamChunkEmitter{}
	ctx := e.OnStartWithStreamInput(context.Background(), nil, nil)
	if ctx == nil {
		t.Fatal("expected non-nil context")
	}
}

// mockToolChatModel implements model.ToolCallingChatModel for testing runUnifiedAgent.
type mockToolChatModel struct {
	generateFn func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error)
}

func (m *mockToolChatModel) Generate(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
	return m.generateFn(ctx, input, opts...)
}

func (m *mockToolChatModel) Stream(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.StreamReader[*einoschema.Message], error) {
	return nil, fmt.Errorf("not implemented")
}

func (m *mockToolChatModel) WithTools(tools []*einoschema.ToolInfo) (model.ToolCallingChatModel, error) {
	return m, nil
}

func (m *mockToolChatModel) BindTools(tools []*einoschema.ToolInfo) error {
	return nil
}

// -------------------------------------------------------
// runUnifiedAgent
// -------------------------------------------------------

func TestRunUnifiedAgent_NoToolCalling(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	llmSvc := llm.NewService("dummy")
	svc := NewService(db, llmSvc)
	_ = svc.Init()
	svc.SetContext(context.Background())

	req := ChatRequest{WorkspacePath: "/workspace", UserMessage: "hello"}
	messages := []*einoschema.Message{{Role: einoschema.User, Content: "hello"}}

	// No tool calling model configured - falls back to streamPlainChat
	svc.runUnifiedAgent(1, messages, req)
}

func TestRunUnifiedAgent_Success(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	llmSvc := llm.NewService("dummy")

	mockModel := &mockToolChatModel{
		generateFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
			return &einoschema.Message{Role: einoschema.Assistant, Content: "normal response"}, nil
		},
	}
	llmSvc.SetChatModel(mockModel)

	svc := NewService(db, llmSvc)
	_ = svc.Init()
	svc.SetContext(context.Background())

	req := ChatRequest{WorkspacePath: "/workspace", UserMessage: "hello"}
	messages := []*einoschema.Message{{Role: einoschema.User, Content: "hello"}}

	svc.runUnifiedAgent(1, messages, req)
}

func TestRunUnifiedAgent_GenerateError(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	llmSvc := llm.NewService("dummy")

	mockModel := &mockToolChatModel{
		generateFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
			return nil, fmt.Errorf("model error")
		},
	}
	llmSvc.SetChatModel(mockModel)

	svc := NewService(db, llmSvc)
	_ = svc.Init()
	svc.SetContext(context.Background())

	req := ChatRequest{WorkspacePath: "/workspace", UserMessage: "hello"}
	messages := []*einoschema.Message{{Role: einoschema.User, Content: "hello"}}

	svc.runUnifiedAgent(1, messages, req)
}

func TestRunUnifiedAgent_WithSystemMessage(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	llmSvc := llm.NewService("dummy")

	mockModel := &mockToolChatModel{
		generateFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
			return &einoschema.Message{Role: einoschema.Assistant, Content: "response"}, nil
		},
	}
	llmSvc.SetChatModel(mockModel)

	svc := NewService(db, llmSvc)
	_ = svc.Init()
	svc.SetContext(context.Background())

	req := ChatRequest{WorkspacePath: "/workspace", UserMessage: "hello", FilePath: "/test.md"}
	messages := []*einoschema.Message{
		{Role: einoschema.System, Content: "original system"},
		{Role: einoschema.User, Content: "hello"},
	}

	svc.runUnifiedAgent(1, messages, req)
}

func TestRunUnifiedAgent_ToolResult(t *testing.T) {
	db, _ := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	llmSvc := llm.NewService("dummy")

	toolResult := `{"_tool_result":true,"tool":"edit","changes":[{"search":"a","replace":"b","position":"all"}],"explanation":"test"}`
	mockModel := &mockToolChatModel{
		generateFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
			return &einoschema.Message{Role: einoschema.Assistant, Content: toolResult}, nil
		},
	}
	llmSvc.SetChatModel(mockModel)

	svc := NewService(db, llmSvc)
	_ = svc.Init()
	svc.SetContext(context.Background())

	req := ChatRequest{WorkspacePath: "/workspace", UserMessage: "edit"}
	messages := []*einoschema.Message{{Role: einoschema.User, Content: "edit"}}

	svc.runUnifiedAgent(1, messages, req)
}
