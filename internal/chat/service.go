package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/cloudwego/eino/adk"
	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/compose"
	einoschema "github.com/cloudwego/eino/schema"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"gorm.io/gorm"
	"mindstack/internal/llm"
)

// Service provides chat and AI editing functionality.
type Service struct {
	store *Store
	llm   *llm.Service
	ctx   context.Context
}

func NewService(db *gorm.DB, llmSvc *llm.Service) *Service {
	return &Service{
		store: NewStore(db),
		llm:   llmSvc,
	}
}

func (s *Service) Init() error {
	return s.store.AutoMigrate()
}

// Store returns the underlying chat store.
func (s *Service) Store() *Store {
	return s.store
}

func (s *Service) SetContext(ctx context.Context) {
	s.ctx = ctx
}

func jsonError(msg string) string {
	out, _ := json.Marshal(map[string]string{"error": msg})
	return string(out)
}

func jsonOK(key string, val any) string {
	out, _ := json.Marshal(map[string]any{"ok": true, key: val})
	return string(out)
}

// --- Session Management ---

func (s *Service) CreateSession(workspacePath string) string {
	session, err := s.store.CreateSession(workspacePath, "New Chat")
	if err != nil {
		return jsonError(err.Error())
	}
	out, _ := json.Marshal(session)
	return string(out)
}

func (s *Service) ListSessions(workspacePath string) string {
	sessions, err := s.store.ListSessions(workspacePath)
	if err != nil {
		return jsonError(err.Error())
	}
	out, _ := json.Marshal(sessions)
	return string(out)
}

func (s *Service) GetSessionHistory(sessionID uint) string {
	messages, err := s.store.GetMessages(sessionID)
	if err != nil {
		return jsonError(err.Error())
	}
	out, _ := json.Marshal(messages)
	return string(out)
}

func (s *Service) DeleteSession(sessionID uint) string {
	if err := s.store.DeleteSession(sessionID); err != nil {
		return jsonError(err.Error())
	}
	return `{"ok":true}`
}

func (s *Service) UpdateSessionTitle(sessionID uint, title string) string {
	if err := s.store.UpdateSessionTitle(sessionID, title); err != nil {
		return jsonError(err.Error())
	}
	return `{"ok":true}`
}

// --- Request Types ---

type ChatRequest struct {
	SessionID      uint             `json:"sessionId"`
	WorkspacePath  string           `json:"workspacePath"`
	Messages       []llmChatMessage `json:"messages"`
	UserMessage    string           `json:"userMessage"`
	CurrentContent string           `json:"currentContent"`
	SelectedText   string           `json:"selectedText"`
	SelectionFrom  int              `json:"selectionFrom"`
	SelectionTo    int              `json:"selectionTo"`
	FilePath       string           `json:"filePath"`
}

type llmChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// --- Tool Definitions ---

var editToolInfo = &einoschema.ToolInfo{
	Name: "edit",
	Desc: `Apply edits to the document. Each change finds an exact snippet of original text and either replaces it, or inserts new text before/after it. Use this tool when the user asks to modify, edit, rewrite, insert, or change any part of their document.`,
	ParamsOneOf: einoschema.NewParamsOneOfByParams(map[string]*einoschema.ParameterInfo{
		"changes": {
			Type:     einoschema.Array,
			Desc:     "List of changes to apply. Each change must contain an exact 'search' snippet from the current document.",
			Required: true,
			ElemInfo: &einoschema.ParameterInfo{
				Type: einoschema.Object,
				SubParams: map[string]*einoschema.ParameterInfo{
					"search": {
						Type:     einoschema.String,
						Desc:     "Exact original text to find in the document. Must match character-for-character including whitespace. Use this as the anchor point for the edit.",
						Required: true,
					},
					"replace": {
						Type:     einoschema.String,
						Desc:     "New text to insert or replace with.",
						Required: true,
					},
					"position": {
						Type: einoschema.String,
						Desc: "Where to apply the change relative to 'search'. 'replace' = replace the search text (default). 'before' = insert replace text before search text. 'after' = insert replace text after search text.",
						Enum: []string{"replace", "before", "after"},
					},
				},
			},
		},
		"explanation": {
			Type: einoschema.String,
			Desc: "A brief explanation of what changes were made and why.",
		},
	}),
}

// editTool implements tool.InvokableTool for document edits.
type editTool struct{}

func (t *editTool) Info(ctx context.Context) (*einoschema.ToolInfo, error) {
	return editToolInfo, nil
}

func (t *editTool) InvokableRun(ctx context.Context, argumentsInJSON string, opts ...tool.Option) (string, error) {
	var args struct {
		Changes []struct {
			Search   string `json:"search"`
			Replace  string `json:"replace"`
			Position string `json:"position"`
		} `json:"changes"`
		Explanation string `json:"explanation"`
	}
	// Try parsing directly first; if it fails, fix unescaped newlines inside JSON string values.
	if err := json.Unmarshal([]byte(argumentsInJSON), &args); err != nil {
		fixedJSON := strings.ReplaceAll(argumentsInJSON, "\n", "\\n")
		if err := json.Unmarshal([]byte(fixedJSON), &args); err != nil {
			return "", fmt.Errorf("parse arguments: %w", err)
		}
	}
	out, _ := json.Marshal(map[string]any{
		"_tool_result": true,
		"tool":         "edit",
		"changes":      args.Changes,
		"explanation":  args.Explanation,
	})
	return string(out), nil
}

// --- Unified Chat Agent ---

func (s *Service) StreamChatWithHistory(reqJSON string) string {
	var req ChatRequest
	if err := json.Unmarshal([]byte(reqJSON), &req); err != nil {
		return jsonError("parse request: " + err.Error())
	}

	sessionID := req.SessionID
	if sessionID == 0 {
		session, err := s.store.GetLatestSession(req.WorkspacePath)
		if err != nil || session == nil {
			session, err = s.store.CreateSession(req.WorkspacePath, truncateTitle(req.UserMessage))
			if err != nil {
				return jsonError("create session: " + err.Error())
			}
		}
		sessionID = session.ID
	}

	// Update title if this is the first message and title is still default
	if msgs, _ := s.store.GetMessages(sessionID); len(msgs) == 0 {
		_ = s.store.UpdateSessionTitle(sessionID, truncateTitle(req.UserMessage))
	}

	// Save user message
	if _, err := s.store.AddMessage(sessionID, "user", req.UserMessage); err != nil {
		return jsonError("save message: " + err.Error())
	}

	// Convert to eino messages
	einoMsgs := make([]*einoschema.Message, len(req.Messages))
	for i, m := range req.Messages {
		einoMsgs[i] = &einoschema.Message{Role: einoschema.RoleType(m.Role), Content: m.Content}
	}

	go s.runUnifiedAgent(sessionID, einoMsgs, req)

	out, _ := json.Marshal(map[string]any{"sessionId": sessionID, "status": "streaming"})
	return string(out)
}

func (s *Service) runUnifiedAgent(sessionID uint, messages []*einoschema.Message, req ChatRequest) {
	logInfof(s.ctx, "[chat] starting unified agent for session=%d", sessionID)

	baseModel := s.llm.GetBaseChatModel()
	if baseModel == nil {
		logError(s.ctx, "[chat] no model configured, falling back to plain chat")
		s.streamPlainChat(sessionID, messages)
		return
	}

	// Replace system prompt with one that includes tool instructions and document context
	systemPrompt := buildSystemPrompt(req.CurrentContent, req.SelectedText, req.SelectionFrom, req.SelectionTo, req.FilePath)
	foundSystem := false
	for i, m := range messages {
		if m.Role == einoschema.System {
			messages[i].Content = systemPrompt
			foundSystem = true
			break
		}
	}
	if !foundSystem {
		// Prepend system message if not present
		messages = append([]*einoschema.Message{{Role: einoschema.System, Content: systemPrompt}}, messages...)
	}

	compressed, err := s.compressMessages(messages)
	if err != nil {
		logErrorf(s.ctx, "[chat] compress messages error: %v", err)
		emitChatChunk(s.ctx, sessionID, "", true, "compress messages: "+err.Error())
		return
	}
	messages = compressed

	agent_, err := adk.NewChatModelAgent(s.ctx, &adk.ChatModelAgentConfig{
		Name:  "mindstack-chat",
		Model: baseModel,
		ToolsConfig: adk.ToolsConfig{
			ToolsNodeConfig: compose.ToolsNodeConfig{
				Tools: []tool.BaseTool{&editTool{}},
			},
			ReturnDirectly: map[string]bool{editToolInfo.Name: true},
		},
	})
	if err != nil {
		logErrorf(s.ctx, "[chat] failed to create agent: %v", err)
		emitChatChunk(s.ctx, sessionID, "", true, "failed to create agent: "+err.Error())
		return
	}

	runner := adk.NewRunner(s.ctx, adk.RunnerConfig{Agent: agent_, EnableStreaming: true})

	logInfof(s.ctx, "[chat] running ADK agent with %d messages", len(messages))
	iter := runner.Run(s.ctx, messages)

	var fullContent string
	isEdit := false
	for {
		event, ok := iter.Next()
		if !ok {
			break
		}
		if event.Err != nil {
			logErrorf(s.ctx, "[chat] agent error: %v", event.Err)
			emitChatChunk(s.ctx, sessionID, "", true, event.Err.Error())
			return
		}
		if event.Output == nil || event.Output.MessageOutput == nil {
			continue
		}

		mv := event.Output.MessageOutput
		switch mv.Role {
		case einoschema.Assistant:
			if mv.IsStreaming {
				if mv.MessageStream == nil {
					continue
				}
				stream := mv.MessageStream
				for {
					chunk, err := stream.Recv()
					if err == io.EOF {
						break
					}
					if err != nil {
						logErrorf(s.ctx, "[chat] stream recv error: %v", err)
						break
					}
					// Tool-call rounds carry no text; skip them and let the tool event drive output.
					if len(chunk.ToolCalls) > 0 {
						continue
					}
					if chunk.Content != "" {
						fullContent += chunk.Content
						emitChatChunk(s.ctx, sessionID, chunk.Content, false, "")
					}
				}
			} else if mv.Message != nil && len(mv.Message.ToolCalls) == 0 && mv.Message.Content != "" {
				fullContent += mv.Message.Content
				emitChatChunk(s.ctx, sessionID, mv.Message.Content, false, "")
			}
		case einoschema.Tool:
			if mv.ToolName == editToolInfo.Name {
				isEdit = true
				s.handleEditResult(sessionID, mv.Message)
			}
		}
	}

	// Edit results are finalized inside handleEditResult; nothing more to emit here.
	if isEdit {
		return
	}

	// Normal chat response. Emit a final done event with full content as fallback
	// (streaming may not always emit chunks), then persist.
	if len(fullContent) > 100000 {
		fullContent = fullContent[:100000] + "\n... [truncated]"
	}
	emitChatChunk(s.ctx, sessionID, fullContent, true, "")
	if _, err := s.store.AddMessage(sessionID, "assistant", fullContent); err != nil {
		logErrorf(s.ctx, "failed to save assistant message: %v", err)
	}
}

// emitChatChunk emits a chat:message:chunk event to the frontend.
func emitChatChunk(ctx context.Context, sessionID uint, content string, done bool, errMsg string) {
	data, _ := json.Marshal(map[string]any{
		"type":      "chat",
		"sessionId": sessionID,
		"content":   content,
		"done":      done,
		"error":     errMsg,
	})
	eventsEmit(ctx, "chat:message:chunk", string(data))
}

// handleEditResult renders an edit tool result as search/replace blocks, emits
// chat:edit:chunk plus a terminating chat done event, and persists the message.
func (s *Service) handleEditResult(sessionID uint, msg *einoschema.Message) {
	content := ""
	if msg != nil {
		content = msg.Content
	}

	var toolResult struct {
		ToolResult bool   `json:"_tool_result"`
		Tool       string `json:"tool"`
		Changes    []struct {
			Search   string `json:"search"`
			Replace  string `json:"replace"`
			Position string `json:"position"`
		} `json:"changes"`
		Explanation string `json:"explanation"`
	}
	if json.Unmarshal([]byte(content), &toolResult) != nil || !toolResult.ToolResult {
		logErrorf(s.ctx, "[chat] invalid edit tool result: %q", content)
		return
	}

	logInfof(s.ctx, "[chat] detected edit result, changes=%d", len(toolResult.Changes))

	// Render changes as search/replace text for frontend
	var srText string
	for _, c := range toolResult.Changes {
		srText += "<<<<<<< SEARCH\n" + c.Search + "\n=======\n" + c.Replace + "\n>>>>>>> REPLACE\n\n"
	}
	// Emit edit event
	data, _ := json.Marshal(map[string]any{
		"type":        "edit",
		"sessionId":   sessionID,
		"content":     srText,
		"changes":     toolResult.Changes,
		"explanation": toolResult.Explanation,
		"done":        true,
		"error":       "",
	})
	eventsEmit(s.ctx, "chat:edit:chunk", string(data))

	// Also emit a chat done event so the stream listener cleans up
	doneData, _ := json.Marshal(map[string]any{
		"type":      "chat",
		"sessionId": sessionID,
		"done":      true,
	})
	eventsEmit(s.ctx, "chat:message:chunk", string(doneData))

	// Save to DB: render changes as search/replace blocks
	var contentToSave string
	if toolResult.Explanation != "" {
		contentToSave = toolResult.Explanation + "\n\n"
	}
	for _, c := range toolResult.Changes {
		contentToSave += "<<<<<<< SEARCH\n" + c.Search + "\n=======\n" + c.Replace + "\n>>>>>>> REPLACE\n\n"
	}
	if len(contentToSave) > 100000 {
		contentToSave = contentToSave[:100000] + "\n... [truncated]"
	}
	if _, err := s.store.AddMessage(sessionID, "assistant", contentToSave); err != nil {
		logErrorf(s.ctx, "failed to save assistant message: %v", err)
	}
}

func buildSystemPrompt(currentContent, selectedText string, selectionFrom, selectionTo int, filePath string) string {
	prompt := `You are a helpful AI assistant for a markdown editor. Answer concisely and clearly.

When the user asks you to modify, edit, rewrite, or change any part of their document, use the "edit" tool and return the complete modified document.

For normal questions and conversation, respond naturally without using tools.`

	if filePath != "" {
		fileName := filepath.Base(filePath)
		prompt += fmt.Sprintf("\n\nCurrent context:\n- Open file: %s\n- Full path: %s", fileName, filePath)
	}

	if currentContent != "" {
		displayContent := currentContent
		if utf8.RuneCountInString(displayContent) > 8000 {
			runes := []rune(displayContent)
			displayContent = string(runes[:8000]) + "\n... [truncated]"
		}
		prompt += fmt.Sprintf("\n\nFile content:\n---\n%s\n---", displayContent)
	}

	if selectedText != "" {
		prompt += fmt.Sprintf("\n\nSelected text (positions %d-%d):\n---\n%s\n---", selectionFrom, selectionTo, selectedText)
	}

	return prompt
}

// streamPlainChat is a fallback when no chat model is configured.
func (s *Service) streamPlainChat(sessionID uint, messages []*einoschema.Message) {
	var fullContent string

	compressed, err := s.compressMessages(messages)
	if err != nil {
		logErrorf(s.ctx, "[chat] compress messages error: %v", err)
		data, _ := json.Marshal(map[string]any{
			"type":      "chat",
			"sessionId": sessionID,
			"done":      true,
			"error":     "compress messages: " + err.Error(),
		})
		eventsEmit(s.ctx, "chat:message:chunk", string(data))
		return
	}
	messages = compressed

	err = s.llm.StreamChat(s.ctx, messages, func(chunk llm.StreamChunk) {
		data, _ := json.Marshal(map[string]any{
			"type":      "chat",
			"sessionId": sessionID,
			"content":   chunk.Content,
			"done":      chunk.Done,
			"error":     chunk.Error,
		})
		eventsEmit(s.ctx, "chat:message:chunk", string(data))

		if chunk.Content != "" {
			fullContent += chunk.Content
		}
	})

	if err != nil {
		data, _ := json.Marshal(map[string]any{
			"type":      "chat",
			"sessionId": sessionID,
			"done":      true,
			"error":     err.Error(),
		})
		eventsEmit(s.ctx, "chat:message:chunk", string(data))
		return
	}

	if len(fullContent) > 100000 {
		fullContent = fullContent[:100000] + "\n... [truncated]"
	}
	if _, err := s.store.AddMessage(sessionID, "assistant", fullContent); err != nil {
		logErrorf(s.ctx, "failed to save assistant message: %v", err)
	}
}

func truncateTitle(text string) string {
	if utf8.RuneCountInString(text) <= 50 {
		return text
	}
	runes := []rune(text)
	return string(runes[:50]) + "..."
}

// llmProvider abstracts the LLM methods needed by chat compression for testability.
type llmProvider interface {
	CountTokens(text string) int
	GetContextWindow() int
	Chat(ctx context.Context, messages []*einoschema.Message) (string, error)
}

// compressMessages checks if the total token count exceeds 80% of the model's context window.
// If so, it summarizes older messages (keeping the most recent 2 pairs intact) and replaces
// them with a summary system message. Returns error if summarization fails.
// logInfof is overridable in tests to avoid Wails runtime calls.
var logInfof = runtime.LogInfof
var logErrorf = runtime.LogErrorf
var logError = runtime.LogError
var eventsEmit = runtime.EventsEmit

func (s *Service) compressMessages(messages []*einoschema.Message) ([]*einoschema.Message, error) {
	result, err := doCompressMessages(s.ctx, s.llm, messages)
	if err != nil {
		return nil, err
	}
	if len(result) != len(messages) {
		logInfof(s.ctx, "[compress] compressed %d -> %d messages", len(messages), len(result))
	}
	return result, nil
}

func doCompressMessages(ctx context.Context, llm llmProvider, messages []*einoschema.Message) ([]*einoschema.Message, error) {
	contextWindow := llm.GetContextWindow()
	if contextWindow <= 0 {
		return messages, nil
	}

	threshold := int(float64(contextWindow) * 0.8)

	totalTokens := 0
	for _, m := range messages {
		totalTokens += llm.CountTokens(m.Content)
	}

	if totalTokens <= threshold {
		return messages, nil
	}

	// Separate original system prompt from chat messages and old summaries.
	// Old summaries are included in compression so the final output has only
	// one summary covering the entire history.
	var systemPrompt *einoschema.Message
	var toCompress []*einoschema.Message
	var chatMsgs []*einoschema.Message
	for _, m := range messages {
		if m.Role == einoschema.System {
			if systemPrompt == nil && !strings.HasPrefix(m.Content, "[Earlier conversation summary]") {
				systemPrompt = m
			} else {
				// Old summary or other system message – feed it back into compression
				toCompress = append(toCompress, m)
			}
		} else {
			chatMsgs = append(chatMsgs, m)
		}
	}

	// Keep at least 2 pairs (4 messages)
	if len(chatMsgs) <= 4 {
		return messages, nil
	}

	// Compress the oldest half of chat messages, but leave at least 4
	compressCount := len(chatMsgs) / 2
	if compressCount < 2 {
		compressCount = 2
	}
	if compressCount > len(chatMsgs)-4 {
		compressCount = len(chatMsgs) - 4
	}

	toCompress = append(toCompress, chatMsgs[:compressCount]...)
	toKeep := chatMsgs[compressCount:]

	summary, err := doSummarizeMessages(ctx, llm, toCompress)
	if err != nil {
		return nil, fmt.Errorf("summarize messages: %w", err)
	}

	result := []*einoschema.Message{}
	if systemPrompt != nil {
		result = append(result, systemPrompt)
	}
	result = append(result, &einoschema.Message{
		Role:    einoschema.System,
		Content: "[Earlier conversation summary]\n" + summary,
	})
	result = append(result, toKeep...)
	return result, nil
}

// summarizeMessages sends the given messages to the LLM and returns a concise summary.
func (s *Service) summarizeMessages(messages []*einoschema.Message) (string, error) {
	return doSummarizeMessages(s.ctx, s.llm, messages)
}

func doSummarizeMessages(ctx context.Context, llm llmProvider, messages []*einoschema.Message) (string, error) {
	var sb strings.Builder
	sb.WriteString("Please summarize the following conversation concisely, preserving key information and decisions:\n\n")
	for _, m := range messages {
		content := m.Content
		if utf8.RuneCountInString(content) > 4000 {
			runes := []rune(content)
			content = string(runes[:4000]) + "\n... [truncated]"
		}
		sb.WriteString(fmt.Sprintf("%s: %s\n\n", m.Role, content))
	}

	summaryMsgs := []*einoschema.Message{
		{Role: einoschema.System, Content: "You are a conversation summarizer. Create a concise summary."},
		{Role: einoschema.User, Content: sb.String()},
	}

	return llm.Chat(ctx, summaryMsgs)
}
