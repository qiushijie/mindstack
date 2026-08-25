package build

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
	"unicode/utf8"

	"mindstack/internal/llm"
	"mindstack/internal/meta"

	einoopenai "github.com/cloudwego/eino-ext/components/model/openai"
	einoschema "github.com/cloudwego/eino/schema"
)

// TestMain shrinks retry delays so retry paths stay fast in tests.
func TestMain(m *testing.M) {
	retryBaseDelay = time.Millisecond
	retryMaxJitter = 0
	os.Exit(m.Run())
}

// writeOpenAIError writes an OpenAI-format error response with the given status.
func writeOpenAIError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":{"message":%q,"type":"test_error"}}`, msg)
}

// newFlakyLLMService creates a service backed by a server that responds with
// failStatus (JSON error body) failTimes times, then returns a valid completion.
func newFlakyLLMService(t *testing.T, failStatus, failTimes int, successContent string) (*llm.Service, *atomic.Int32, func()) {
	t.Helper()

	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := int(calls.Add(1))
		if n <= failTimes {
			writeOpenAIError(w, failStatus, "transient failure")
			return
		}
		writeOpenAIResponse(t, w, successContent)
	}))

	svc := llm.NewService(t.TempDir())
	if err := svc.UpdateModel(&llm.ActiveModelConfig{
		ID: "test", Model: "test-model", ApiURL: server.URL, ApiKey: "test-key",
	}); err != nil {
		server.Close()
		t.Fatalf("failed to update model: %v", err)
	}
	return svc, &calls, server.Close
}

func testMessages() []*einoschema.Message {
	return []*einoschema.Message{{Role: einoschema.User, Content: "ping"}}
}

func TestChatWithRetry_SucceedsAfterTransientFailures(t *testing.T) {
	svc, calls, closeFn := newFlakyLLMService(t, http.StatusInternalServerError, 2, `{"ok":true}`)
	defer closeFn()

	resp, err := chatWithRetry(context.Background(), svc, testMessages())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp != `{"ok":true}` {
		t.Fatalf("unexpected response: %q", resp)
	}
	if got := calls.Load(); got != 3 {
		t.Fatalf("expected 3 requests (2 failures + 1 success), got %d", got)
	}
}

func TestChatWithRetry_RateLimitIsRetried(t *testing.T) {
	svc, calls, closeFn := newFlakyLLMService(t, http.StatusTooManyRequests, 2, `{"ok":true}`)
	defer closeFn()

	if _, err := chatWithRetry(context.Background(), svc, testMessages()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := calls.Load(); got != 3 {
		t.Fatalf("expected 3 requests for retried 429s, got %d", got)
	}
}

func TestChatWithRetry_NonRetryableErrorReturnsImmediately(t *testing.T) {
	svc, calls, closeFn := newFlakyLLMService(t, http.StatusBadRequest, 100, `{"ok":true}`)
	defer closeFn()

	_, err := chatWithRetry(context.Background(), svc, testMessages())
	if err == nil {
		t.Fatal("expected error for persistent 400")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("expected exactly 1 request for non-retryable 400, got %d", got)
	}
}

func TestChatWithRetry_ExhaustsRetries(t *testing.T) {
	svc, calls, closeFn := newFlakyLLMService(t, http.StatusInternalServerError, 100, `{"ok":true}`)
	defer closeFn()

	_, err := chatWithRetry(context.Background(), svc, testMessages())
	if err == nil {
		t.Fatal("expected error after exhausting retries")
	}
	if !strings.Contains(err.Error(), fmt.Sprintf("after %d attempts", retryMaxAttempts)) {
		t.Fatalf("expected attempts message in error, got: %v", err)
	}
	// 1 initial attempt + 3 retries.
	if got := calls.Load(); got != int32(retryMaxAttempts) {
		t.Fatalf("expected %d requests, got %d", retryMaxAttempts, got)
	}
}

func TestChatWithRetry_ContextCancelled(t *testing.T) {
	svc, _, closeFn := newFlakyLLMService(t, http.StatusInternalServerError, 100, `{"ok":true}`)
	defer closeFn()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := chatWithRetry(ctx, svc, testMessages())
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected context.Canceled, got %v", err)
	}
}

func TestIsRetryableError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"500 retryable", &einoopenai.APIError{HTTPStatusCode: 500, Message: "server"}, true},
		{"502 retryable", &einoopenai.APIError{HTTPStatusCode: 502, Message: "bad gateway"}, true},
		{"429 retryable", &einoopenai.APIError{HTTPStatusCode: 429, Message: "rate limited"}, true},
		{"408 retryable", &einoopenai.APIError{HTTPStatusCode: 408, Message: "request timeout"}, true},
		{"301 not retryable", &einoopenai.APIError{HTTPStatusCode: 301, Message: "moved"}, false},
		{"302 not retryable", &einoopenai.APIError{HTTPStatusCode: 302, Message: "found"}, false},
		{"400 not retryable", &einoopenai.APIError{HTTPStatusCode: 400, Message: "bad request"}, false},
		{"401 not retryable", &einoopenai.APIError{HTTPStatusCode: 401, Message: "unauthorized"}, false},
		{"404 not retryable", &einoopenai.APIError{HTTPStatusCode: 404, Message: "not found"}, false},
		{"200 not retryable", &einoopenai.APIError{HTTPStatusCode: 200, Message: "ok"}, false},
		{"wrapped 500 retryable", fmt.Errorf("generate: %w", &einoopenai.APIError{HTTPStatusCode: 500}), true},
		{"wrapped 400 not retryable", fmt.Errorf("generate: %w", &einoopenai.APIError{HTTPStatusCode: 400}), false},
		{"wrapped 408 retryable", fmt.Errorf("generate: %w", &einoopenai.APIError{HTTPStatusCode: 408}), true},
		{"network error retryable", fmt.Errorf("dial tcp: connection refused"), true},
	}
	for _, c := range cases {
		if got := isRetryableError(c.err); got != c.want {
			t.Errorf("%s: isRetryableError = %v, want %v", c.name, got, c.want)
		}
	}
}

// --- truncateContentForPrompt tests ---

func TestTruncateContentForPrompt_WithinBudget(t *testing.T) {
	svc := llm.NewService("")
	content := "# Short doc\n\nJust a few words."

	got := truncateContentForPrompt(svc, content)
	if got != content {
		t.Fatalf("expected content unchanged, got %q", got)
	}
}

func TestTruncateContentForPrompt_OverBudget(t *testing.T) {
	// Budget = window - promptOverheadTokens = 100 tokens.
	t.Setenv("MINDSTACK_DEBUG_CONTEXT_WINDOW", "4100")
	svc := llm.NewService("")

	var sb strings.Builder
	sb.WriteString("# Long document introduction with some opening words.\n\n")
	for i := 0; i < 400; i++ {
		sb.WriteString("This is filler sentence number ")
		sb.WriteString(fmt.Sprintf("%d", i))
		sb.WriteString(" with enough words to consume tokens steadily.\n")
	}
	sb.WriteString("\nFinal closing remarks at the very end of the document.")
	content := sb.String()

	got := truncateContentForPrompt(svc, content)

	if got == content {
		t.Fatal("expected content to be truncated")
	}
	if !strings.Contains(got, "[middle truncated]") {
		t.Fatal("expected truncation marker in output")
	}
	if !strings.HasPrefix(got, "# Long document introduction") {
		t.Fatal("expected head of the document to be preserved")
	}
	if !strings.HasSuffix(got, "Final closing remarks at the very end of the document.") {
		t.Fatal("expected tail of the document to be preserved")
	}
	// 100 token budget split 70/20 plus a small marker; allow slack for the marker.
	if tokens := svc.CountTokens(got); tokens > 100+20 {
		t.Fatalf("expected truncated content near budget, got %d tokens", tokens)
	}
}

func TestTruncateContentForPrompt_ValidUTF8WithMultibyteContent(t *testing.T) {
	t.Setenv("MINDSTACK_DEBUG_CONTEXT_WINDOW", "4100")
	svc := llm.NewService("")

	content := "# 标题\n\n" + strings.Repeat("这是一段用于消耗令牌的中文内容，重复多次以超出预算。", 200) + "\n结尾段落。"

	got := truncateContentForPrompt(svc, content)
	if !strings.Contains(got, "[middle truncated]") {
		t.Fatal("expected truncation marker in output")
	}
	if !utf8.ValidString(got) {
		t.Fatal("expected truncated content to be valid UTF-8")
	}
	if !strings.HasSuffix(got, "结尾段落。") {
		t.Fatal("expected multibyte tail to be preserved")
	}
}

func TestTruncateContentForPrompt_NonPositiveBudgetFallsBack(t *testing.T) {
	// Window smaller than promptOverheadTokens leaves a non-positive budget;
	// the fallback budget of 1000 tokens must still truncate long content.
	t.Setenv("MINDSTACK_DEBUG_CONTEXT_WINDOW", "100")
	svc := llm.NewService("")

	var sb strings.Builder
	sb.WriteString("# Long document introduction.\n\n")
	for i := 0; i < 400; i++ {
		sb.WriteString("This is filler sentence number ")
		sb.WriteString(fmt.Sprintf("%d", i))
		sb.WriteString(" with enough words to consume tokens steadily.\n")
	}
	sb.WriteString("\nFinal closing remarks at the very end.")
	content := sb.String()

	got := truncateContentForPrompt(svc, content)
	if got == content {
		t.Fatal("expected content to be truncated under the fallback budget")
	}
	if !strings.Contains(got, "[middle truncated]") {
		t.Fatal("expected truncation marker in output")
	}
	// 1000 token fallback split 70/20 plus a small marker; allow slack.
	if tokens := svc.CountTokens(got); tokens > 1000+20 {
		t.Fatalf("expected truncated content near fallback budget, got %d tokens", tokens)
	}
}

func TestTruncateContentForPrompt_NonPositiveBudgetShortContentUnchanged(t *testing.T) {
	// Content within the 1000-token fallback budget is returned unchanged even
	// when the computed budget is non-positive.
	t.Setenv("MINDSTACK_DEBUG_CONTEXT_WINDOW", "100")
	svc := llm.NewService("")

	content := "# Short doc\n\nJust a few words."
	if got := truncateContentForPrompt(svc, content); got != content {
		t.Fatalf("expected content unchanged, got %q", got)
	}
}

// --- buildWorkers tests ---

func TestBuildWorkers_Default(t *testing.T) {
	if got := buildWorkers(); got != defaultBuildWorkers {
		t.Fatalf("expected default %d workers, got %d", defaultBuildWorkers, got)
	}
}

func TestBuildWorkers_EnvOverride(t *testing.T) {
	t.Setenv("MINDSTACK_BUILD_WORKERS", "7")
	if got := buildWorkers(); got != 7 {
		t.Fatalf("expected 7 workers from env, got %d", got)
	}
}

func TestBuildWorkers_InvalidEnvFallsBack(t *testing.T) {
	t.Setenv("MINDSTACK_BUILD_WORKERS", "not-a-number")
	if got := buildWorkers(); got != defaultBuildWorkers {
		t.Fatalf("expected default workers for invalid env, got %d", got)
	}
}

// --- findCandidateDocs candidate cap tests ---

func TestFindCandidateDocs_CapsAtMaxRelationCandidates(t *testing.T) {
	allMetas := []*meta.DocumentMeta{
		{Path: "changed.md", Tags: []string{"go"}},
	}
	// Create more candidates than the cap, all sharing one tag.
	for i := 0; i < maxRelationCandidates+5; i++ {
		allMetas = append(allMetas, &meta.DocumentMeta{
			Path: fmt.Sprintf("cand-%02d.md", i),
			Tags: []string{"go"},
		})
	}
	// One doc shares two tags and must sort first.
	allMetas = append(allMetas, &meta.DocumentMeta{
		Path: "strong.md",
		Tags: []string{"go", "api"},
	})
	// Give the changed doc the second tag too so strong.md shares two.
	allMetas[0].Tags = []string{"go", "api"}

	result := findCandidateDocs(allMetas, map[string]bool{"changed.md": true})
	cands := result["changed.md"]
	if len(cands) != maxRelationCandidates {
		t.Fatalf("expected %d candidates, got %d", maxRelationCandidates, len(cands))
	}
	if cands[0].path != "strong.md" {
		t.Fatalf("expected strongest candidate first, got %s", cands[0].path)
	}
}

func TestFindCandidateDocs_SortedBySharedTagCount(t *testing.T) {
	allMetas := []*meta.DocumentMeta{
		{Path: "changed.md", Tags: []string{"a", "b", "c"}},
		{Path: "one.md", Tags: []string{"a"}},
		{Path: "three.md", Tags: []string{"a", "b", "c"}},
		{Path: "two.md", Tags: []string{"a", "b"}},
	}

	result := findCandidateDocs(allMetas, map[string]bool{"changed.md": true})
	cands := result["changed.md"]
	if len(cands) != 3 {
		t.Fatalf("expected 3 candidates, got %d", len(cands))
	}
	want := []string{"three.md", "two.md", "one.md"}
	for i, w := range want {
		if cands[i].path != w {
			t.Fatalf("candidate %d: expected %s, got %s", i, w, cands[i].path)
		}
	}
}
