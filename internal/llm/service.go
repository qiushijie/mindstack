package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/cloudwego/eino-ext/components/model/openai"
	"github.com/cloudwego/eino/components/model"
	einoschema "github.com/cloudwego/eino/schema"
)

type ActiveModelConfig struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	ApiURL  string `json:"apiUrl"`
	ApiKey  string `json:"apiKey"`
}

type Service struct {
	mu         sync.RWMutex
	chatModel  model.ChatModel
	active     *ActiveModelConfig
	configPath string
}

func NewService(configPath string) *Service {
	return &Service{configPath: configPath}
}

const maxConfigSize = 64 * 1024 // 64KB

func loadActiveModel(configPath string) (*ActiveModelConfig, error) {
	info, err := os.Stat(configPath)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	if info.Size() > maxConfigSize {
		return nil, fmt.Errorf("config file exceeds 64KB limit")
	}
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	settingsRaw, ok := raw["settings"]
	if !ok {
		return nil, fmt.Errorf("no settings found")
	}

	var settings struct {
		Models       []ActiveModelConfig `json:"models"`
		ActiveModelID string             `json:"activeModelId"`
	}
	if err := json.Unmarshal(settingsRaw, &settings); err != nil {
		return nil, fmt.Errorf("parse settings: %w", err)
	}

	for i := range settings.Models {
		if settings.Models[i].ID == settings.ActiveModelID {
			m := settings.Models[i]
			return &m, nil
		}
	}
	return nil, fmt.Errorf("active model %q not found", settings.ActiveModelID)
}

func (s *Service) InitFromConfig() error {
	cfg, err := loadActiveModel(s.configPath)
	if err != nil {
		return err
	}
	return s.UpdateModel(cfg)
}

func (s *Service) UpdateModel(cfg *ActiveModelConfig) error {
	if cfg.ApiURL == "" || cfg.ApiKey == "" {
		return fmt.Errorf("api url and api key are required")
	}

	ctx := context.Background()
	modelCfg := &openai.ChatModelConfig{
		Model:   cfg.Model,
		APIKey:  cfg.ApiKey,
		BaseURL: cfg.ApiURL,
		Timeout: 300 * time.Second,
	}

	chatModel, err := openai.NewChatModel(ctx, modelCfg)
	if err != nil {
		return fmt.Errorf("create chat model: %w", err)
	}

	s.mu.Lock()
	s.chatModel = chatModel
	s.active = cfg
	s.mu.Unlock()

	return nil
}

func (s *Service) Chat(ctx context.Context, messages []*einoschema.Message) (string, error) {
	s.mu.RLock()
	cm := s.chatModel
	s.mu.RUnlock()

	if cm == nil {
		return "", fmt.Errorf("no model configured")
	}

	resp, err := cm.Generate(ctx, messages)
	if err != nil {
		return "", fmt.Errorf("generate: %w", err)
	}
	return resp.Content, nil
}

type StreamChunk struct {
	Content string `json:"content"`
	Done    bool   `json:"done"`
	Error   string `json:"error,omitempty"`
}

func (s *Service) StreamChat(ctx context.Context, messages []*einoschema.Message, onChunk func(chunk StreamChunk)) error {
	s.mu.RLock()
	cm := s.chatModel
	s.mu.RUnlock()

	if cm == nil {
		return fmt.Errorf("no model configured")
	}

	stream, err := cm.Stream(ctx, messages)
	if err != nil {
		return fmt.Errorf("stream: %w", err)
	}
	defer stream.Close()

	for {
		chunk, err := stream.Recv()
		if err == io.EOF {
			onChunk(StreamChunk{Done: true})
			return nil
		}
		if err != nil {
			onChunk(StreamChunk{Error: err.Error(), Done: true})
			return err
		}
		if chunk.Content != "" {
			onChunk(StreamChunk{Content: chunk.Content})
		}
	}
}

func (s *Service) GetActiveModel() *ActiveModelConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.active == nil {
		return nil
	}
	cp := *s.active
	return &cp
}
