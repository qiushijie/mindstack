package config

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

const maxConfigSize = 64 * 1024 // 64KB

// ConfigPath returns the absolute path to the application config file.
// It checks MINDSTACK_CONFIG_DIR env var first, then falls back to the
// OS-specific user config directory.
func ConfigPath() string {
	if dir := os.Getenv("MINDSTACK_CONFIG_DIR"); dir != "" {
		return filepath.Join(dir, "config.json")
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "mindstack", "config.json")
}

// Config represents .knowledge-base/config.yaml.
// Knowledge base side: has Name, Description, Version.
// Project side (link): has KnowledgeBases pointing to KB paths.
type Config struct {
	Name            string   `yaml:"name,omitempty" json:"name,omitempty"`
	Description     string   `yaml:"description,omitempty" json:"description,omitempty"`
	Version         string   `yaml:"version,omitempty" json:"version,omitempty"`
	KnowledgeBase   string   `yaml:"knowledge_base,omitempty" json:"knowledge_base,omitempty"`    // backward compat, single link
	KnowledgeBases  []string `yaml:"knowledge_bases,omitempty" json:"knowledge_bases,omitempty"` // multiple links
}

// DefaultConfig returns a knowledge base side config.
func DefaultConfig() *Config {
	return &Config{
		Version: "1",
	}
}

// LoadConfig reads config.yaml from the given path.
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if len(data) > maxConfigSize {
		return nil, errConfigTooLarge
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

// SaveConfig writes config to the given path.
func SaveConfig(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// GetKnowledgeBases returns all linked knowledge base paths.
// Supports both legacy single knowledge_base and new knowledge_bases list.
func (c *Config) GetKnowledgeBases() []string {
	if len(c.KnowledgeBases) > 0 {
		return c.KnowledgeBases
	}
	if c.KnowledgeBase != "" {
		return []string{c.KnowledgeBase}
	}
	return nil
}

// IsKnowledgeBase returns true if this config represents a knowledge base (not a link).
func (c *Config) IsKnowledgeBase() bool {
	return len(c.GetKnowledgeBases()) == 0
}

var errConfigTooLarge = &configError{"config file exceeds 64KB limit"}

type configError struct {
	msg string
}

func (e *configError) Error() string { return e.msg }
