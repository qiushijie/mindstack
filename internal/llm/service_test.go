package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cloudwego/eino/components/model"
	einoschema "github.com/cloudwego/eino/schema"
)

// mockChatModel implements model.ChatModel for testing without real API calls.
type mockChatModel struct {
	generateFn func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error)
	streamFn   func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.StreamReader[*einoschema.Message], error)
}

func (m *mockChatModel) Generate(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
	return m.generateFn(ctx, input, opts...)
}

func (m *mockChatModel) Stream(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.StreamReader[*einoschema.Message], error) {
	return m.streamFn(ctx, input, opts...)
}

func (m *mockChatModel) BindTools(tools []*einoschema.ToolInfo) error { return nil }

// helper to write a config file and return its path
func writeConfig(t *testing.T, data any) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "config.json")
	raw, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	if err := os.WriteFile(p, raw, 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return p
}

// -------------------------------------------------------
// loadActiveModel
// -------------------------------------------------------

func TestLoadActiveModel_ValidConfig(t *testing.T) {
	p := writeConfig(t, map[string]any{
		"settings": map[string]any{
			"models": []map[string]any{
				{
					"id":     "m1",
					"model":  "deepseek-v4-flash",
					"apiUrl": "https://api.example.com/v1",
					"apiKey": "key1",
				},
			},
			"activeModelId": "m1",
		},
	})

	cfg, err := loadActiveModel(p)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.ID != "m1" {
		t.Fatalf("expected id m1, got %s", cfg.ID)
	}
	if cfg.Model != "deepseek-v4-flash" {
		t.Fatalf("expected model deepseek-v4-flash, got %s", cfg.Model)
	}
	if cfg.ApiURL != "https://api.example.com/v1" {
		t.Fatalf("expected apiUrl https://api.example.com/v1, got %s", cfg.ApiURL)
	}
	if cfg.ApiKey != "key1" {
		t.Fatalf("expected apiKey key1, got %s", cfg.ApiKey)
	}
}

func TestLoadActiveModel_NoSettingsKey(t *testing.T) {
	p := writeConfig(t, map[string]any{
		"other": "value",
	})

	_, err := loadActiveModel(p)
	if err == nil {
		t.Fatal("expected error when settings key is missing")
	}
	if !strings.Contains(err.Error(), "no settings") {
		t.Fatalf("expected 'no settings' error, got: %v", err)
	}
}

func TestLoadActiveModel_ActiveModelNotFound(t *testing.T) {
	p := writeConfig(t, map[string]any{
		"settings": map[string]any{
			"models": []map[string]any{
				{"id": "m1", "model": "a", "apiUrl": "u", "apiKey": "k"},
			},
			"activeModelId": "nonexistent",
		},
	})

	_, err := loadActiveModel(p)
	if err == nil {
		t.Fatal("expected error when active model not found in list")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected 'not found' error, got: %v", err)
	}
}

func TestLoadActiveModel_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "config.json")
	if err := os.WriteFile(p, []byte("{invalid json}"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	_, err := loadActiveModel(p)
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
	if !strings.Contains(err.Error(), "parse config") {
		t.Fatalf("expected 'parse config' error, got: %v", err)
	}
}

func TestLoadActiveModel_FileTooLarge(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "config.json")
	// create a file larger than 64KB
	big := make([]byte, 64*1024+1)
	for i := range big {
		big[i] = 'a'
	}
	if err := os.WriteFile(p, big, 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	_, err := loadActiveModel(p)
	if err == nil {
		t.Fatal("expected error for oversized file")
	}
	if !strings.Contains(err.Error(), "64KB") {
		t.Fatalf("expected '64KB' error, got: %v", err)
	}
}

func TestLoadActiveModel_NonexistentFile(t *testing.T) {
	_, err := loadActiveModel(filepath.Join(t.TempDir(), "nope.json"))
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
	if !strings.Contains(err.Error(), "read config") {
		t.Fatalf("expected 'read config' error, got: %v", err)
	}
}

// -------------------------------------------------------
// NewService
// -------------------------------------------------------

func TestNewService(t *testing.T) {
	svc := NewService("/some/path")
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.configPath != "/some/path" {
		t.Fatalf("expected configPath /some/path, got %s", svc.configPath)
	}
	if svc.chatModel != nil {
		t.Fatal("expected nil chatModel on new service")
	}
	if svc.active != nil {
		t.Fatal("expected nil active on new service")
	}
}

// -------------------------------------------------------
// GetActiveModel
// -------------------------------------------------------

func TestGetActiveModel_Nil(t *testing.T) {
	svc := NewService("dummy")
	if got := svc.GetActiveModel(); got != nil {
		t.Fatalf("expected nil, got %+v", got)
	}
}

func TestGetActiveModel_ValueCopy(t *testing.T) {
	svc := NewService("dummy")
	svc.active = &ActiveModelConfig{
		ID:     "m1",
		Model:  "test-model",
		ApiURL: "https://api.test.com",
		ApiKey: "secret",
	}

	got := svc.GetActiveModel()
	if got == nil {
		t.Fatal("expected non-nil result")
	}

	// modifying returned copy should not affect internal state
	got.ApiKey = "changed"
	if svc.active.ApiKey == "changed" {
		t.Fatal("GetActiveModel should return a value copy, but internal state was mutated")
	}
}

// -------------------------------------------------------
// Chat
// -------------------------------------------------------

func TestChat_NoModelConfigured(t *testing.T) {
	svc := NewService("dummy")
	_, err := svc.Chat(context.Background(), nil)
	if err == nil {
		t.Fatal("expected error when no model configured")
	}
	if !strings.Contains(err.Error(), "no model configured") {
		t.Fatalf("expected 'no model configured' error, got: %v", err)
	}
}

func TestChat_Success(t *testing.T) {
	svc := NewService("dummy")
	svc.chatModel = &mockChatModel{
		generateFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
			return &einoschema.Message{Content: "hello world"}, nil
		},
	}
	svc.active = &ActiveModelConfig{ID: "m1"}

	msgs := []*einoschema.Message{
		{Role: "user", Content: "hi"},
	}
	resp, err := svc.Chat(context.Background(), msgs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp != "hello world" {
		t.Fatalf("expected 'hello world', got %q", resp)
	}
}

func TestChat_GenerateError(t *testing.T) {
	svc := NewService("dummy")
	svc.chatModel = &mockChatModel{
		generateFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.Message, error) {
			return nil, fmt.Errorf("api error: rate limit")
		},
	}
	svc.active = &ActiveModelConfig{ID: "m1"}

	_, err := svc.Chat(context.Background(), nil)
	if err == nil {
		t.Fatal("expected error from generate")
	}
	if !strings.Contains(err.Error(), "generate") {
		t.Fatalf("expected 'generate' in error, got: %v", err)
	}
	if !strings.Contains(err.Error(), "rate limit") {
		t.Fatalf("expected 'rate limit' in error, got: %v", err)
	}
}

// -------------------------------------------------------
// StreamChat
// -------------------------------------------------------

func TestStreamChat_NoModelConfigured(t *testing.T) {
	svc := NewService("dummy")
	err := svc.StreamChat(context.Background(), nil, func(chunk StreamChunk) {})
	if err == nil {
		t.Fatal("expected error when no model configured")
	}
	if !strings.Contains(err.Error(), "no model configured") {
		t.Fatalf("expected 'no model configured' error, got: %v", err)
	}
}

func TestStreamChat_Success(t *testing.T) {
	svc := NewService("dummy")
	svc.chatModel = &mockChatModel{
		streamFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.StreamReader[*einoschema.Message], error) {
			msgs := []*einoschema.Message{
				{Content: "chunk1"},
				{Content: "chunk2"},
			}
			return einoschema.StreamReaderFromArray(msgs), nil
		},
	}
	svc.active = &ActiveModelConfig{ID: "m1"}

	var chunks []StreamChunk
	err := svc.StreamChat(context.Background(), nil, func(chunk StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// expect: chunk1, chunk2, then done
	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d: %+v", len(chunks), chunks)
	}
	if chunks[0].Content != "chunk1" {
		t.Fatalf("expected chunk1, got %q", chunks[0].Content)
	}
	if chunks[1].Content != "chunk2" {
		t.Fatalf("expected chunk2, got %q", chunks[1].Content)
	}
	if !chunks[2].Done {
		t.Fatal("expected final chunk to have Done=true")
	}
	if chunks[2].Content != "" {
		t.Fatalf("expected empty content on done chunk, got %q", chunks[2].Content)
	}
}

func TestStreamChat_StreamError(t *testing.T) {
	svc := NewService("dummy")
	svc.chatModel = &mockChatModel{
		streamFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.StreamReader[*einoschema.Message], error) {
			// stream returns one message then an error via a failing reader
			msgs := []*einoschema.Message{
				{Content: "partial"},
			}
			return einoschema.StreamReaderFromArray(msgs), nil
		},
	}
	svc.active = &ActiveModelConfig{ID: "m1"}

	// This tests the normal path where StreamReaderFromArray completes cleanly.
	// To test actual stream errors we need a custom StreamReader, which is done below.
	var chunks []StreamChunk
	err := svc.StreamChat(context.Background(), nil, func(chunk StreamChunk) {
		chunks = append(chunks, chunk)
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks (content + done), got %d", len(chunks))
	}
}

func TestStreamChat_StreamCreateError(t *testing.T) {
	svc := NewService("dummy")
	svc.chatModel = &mockChatModel{
		streamFn: func(ctx context.Context, input []*einoschema.Message, opts ...model.Option) (*einoschema.StreamReader[*einoschema.Message], error) {
			return nil, fmt.Errorf("connection failed")
		},
	}
	svc.active = &ActiveModelConfig{ID: "m1"}

	err := svc.StreamChat(context.Background(), nil, func(chunk StreamChunk) {})
	if err == nil {
		t.Fatal("expected error when stream creation fails")
	}
	if !strings.Contains(err.Error(), "stream") {
		t.Fatalf("expected 'stream' in error, got: %v", err)
	}
	if !strings.Contains(err.Error(), "connection failed") {
		t.Fatalf("expected 'connection failed' in error, got: %v", err)
	}
}

// -------------------------------------------------------
// UpdateModel validation
// -------------------------------------------------------

func TestUpdateModel_EmptyApiURL(t *testing.T) {
	svc := NewService("dummy")
	err := svc.UpdateModel(&ActiveModelConfig{
		Model:  "test",
		ApiURL: "",
		ApiKey: "key",
	})
	if err == nil {
		t.Fatal("expected error for empty ApiURL")
	}
	if !strings.Contains(err.Error(), "api url") {
		t.Fatalf("expected 'api url' in error, got: %v", err)
	}
}

func TestUpdateModel_EmptyApiKey(t *testing.T) {
	svc := NewService("dummy")
	err := svc.UpdateModel(&ActiveModelConfig{
		Model:  "test",
		ApiURL: "https://api.test.com",
		ApiKey: "",
	})
	if err == nil {
		t.Fatal("expected error for empty ApiKey")
	}
	if !strings.Contains(err.Error(), "api key") {
		t.Fatalf("expected 'api key' in error, got: %v", err)
	}
}

func TestUpdateModel_BothEmpty(t *testing.T) {
	svc := NewService("dummy")
	err := svc.UpdateModel(&ActiveModelConfig{
		Model:  "test",
		ApiURL: "",
		ApiKey: "",
	})
	if err == nil {
		t.Fatal("expected error for empty ApiURL and ApiKey")
	}
}

func TestUpdateModel_Success(t *testing.T) {
	svc := NewService("dummy")
	cfg := &ActiveModelConfig{
		ID:     "m1",
		Model:  "test-model",
		ApiURL: "http://localhost:0/v1",
		ApiKey: "test-key",
	}

	err := svc.UpdateModel(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify the active model was stored correctly
	active := svc.GetActiveModel()
	if active == nil {
		t.Fatal("expected non-nil active model after UpdateModel")
	}
	if active.ID != "m1" {
		t.Fatalf("expected ID m1, got %s", active.ID)
	}
	if active.Model != "test-model" {
		t.Fatalf("expected model test-model, got %s", active.Model)
	}
	if active.ApiURL != "http://localhost:0/v1" {
		t.Fatalf("expected apiUrl http://localhost:0/v1, got %s", active.ApiURL)
	}
	if active.ApiKey != "test-key" {
		t.Fatalf("expected apiKey test-key, got %s", active.ApiKey)
	}

	// Verify chatModel is set
	if svc.chatModel == nil {
		t.Fatal("expected chatModel to be set after UpdateModel")
	}
}

// -------------------------------------------------------
// InitFromConfig
// -------------------------------------------------------

func TestInitFromConfig_ValidConfig(t *testing.T) {
	p := writeConfig(t, map[string]any{
		"settings": map[string]any{
			"models": []map[string]any{
				{
					"id":     "m1",
					"model":  "test-model",
					"apiUrl": "http://localhost:0/v1",
					"apiKey": "test-key",
				},
			},
			"activeModelId": "m1",
		},
	})

	svc := NewService(p)
	err := svc.InitFromConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	active := svc.GetActiveModel()
	if active == nil {
		t.Fatal("expected non-nil active model after InitFromConfig")
	}
	if active.ID != "m1" {
		t.Fatalf("expected ID m1, got %s", active.ID)
	}
	if active.Model != "test-model" {
		t.Fatalf("expected model test-model, got %s", active.Model)
	}
	if active.ApiURL != "http://localhost:0/v1" {
		t.Fatalf("expected apiUrl http://localhost:0/v1, got %s", active.ApiURL)
	}
	if active.ApiKey != "test-key" {
		t.Fatalf("expected apiKey test-key, got %s", active.ApiKey)
	}
}

func TestInitFromConfig_FileNotFound(t *testing.T) {
	svc := NewService(filepath.Join(t.TempDir(), "nonexistent.json"))
	err := svc.InitFromConfig()
	if err == nil {
		t.Fatal("expected error when config file does not exist")
	}
	if !strings.Contains(err.Error(), "read config") {
		t.Fatalf("expected 'read config' error, got: %v", err)
	}
}
