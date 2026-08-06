package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

const maxConfigSize = 64 * 1024 // 64KB

var customConfigPath string

// Overridable for testing.
var userHomeDir = os.UserHomeDir

// SetCustomConfigPath sets a custom config path via the --config CLI flag.
func SetCustomConfigPath(path string) {
	customConfigPath = path
}

// ResolveConfigPath returns the config path with the following priority:
// 1. --config CLI flag (set via SetCustomConfigPath)
// 2. ~/.mindstack/config.json (if exists)
// 3. Default ConfigPath() (MINDSTACK_CONFIG_DIR env or OS config dir)
func ResolveConfigPath() string {
	if customConfigPath != "" {
		return customConfigPath
	}
	homeDir, err := userHomeDir()
	if err == nil {
		homeCfg := filepath.Join(homeDir, ".mindstack", "config.json")
		if _, err := os.Stat(homeCfg); err == nil {
			return homeCfg
		}
	}
	return ConfigPath()
}

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

// Config represents a knowledge base's .mindstack/config.yaml or a project's
// mindstack.yaml link file.
// Knowledge base side: has Name, Description, Version.
// Project side (mindstack.yaml): has KnowledgeBases listing KB names.
type Config struct {
	Name           string   `yaml:"name,omitempty" json:"name,omitempty"`
	Description    string   `yaml:"description,omitempty" json:"description,omitempty"`
	Version        string   `yaml:"version,omitempty" json:"version,omitempty"`
	KnowledgeBases []string `yaml:"knowledge_bases,omitempty" json:"knowledge_bases,omitempty"` // linked KB names
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

// GetKnowledgeBases returns all linked knowledge base names.
func (c *Config) GetKnowledgeBases() []string {
	return c.KnowledgeBases
}

var errConfigTooLarge = &configError{"config file exceeds 64KB limit"}

type configError struct {
	msg string
}

func (e *configError) Error() string { return e.msg }

// kbRegistryKey is the top-level key of the KB name -> path registry inside
// the global config.json. The registry is machine-local and never committed.
const kbRegistryKey = "knowledgeBases"

// NameConflictError is returned when a KB name is already registered to a
// different path.
type NameConflictError struct {
	Name         string
	ExistingPath string
}

func (e *NameConflictError) Error() string {
	return fmt.Sprintf("knowledge base name %q is already registered to %s", e.Name, e.ExistingPath)
}

// loadConfigFileMap reads the global config.json as a raw map so unknown
// fields (settings, recentEntries, ...) are preserved on write.
func loadConfigFileMap() (map[string]interface{}, string, error) {
	path := ResolveConfigPath()
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return map[string]interface{}{}, path, nil
	}
	if err != nil {
		return nil, path, err
	}
	var m map[string]interface{}
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, path, fmt.Errorf("cannot parse config file %s: %w", path, err)
	}
	return m, path, nil
}

func kbRegistry(m map[string]interface{}) map[string]string {
	reg := map[string]string{}
	if raw, ok := m[kbRegistryKey].(map[string]interface{}); ok {
		for k, v := range raw {
			if s, ok := v.(string); ok {
				reg[k] = s
			}
		}
	}
	return reg
}

// RegisterKnowledgeBase records a KB name -> path mapping in the global
// config.json. Returns NameConflictError if the name is taken by another path.
func RegisterKnowledgeBase(name, path string) error {
	if name == "" || path == "" {
		return fmt.Errorf("knowledge base name and path must not be empty")
	}
	m, cfgPath, err := loadConfigFileMap()
	if err != nil {
		return err
	}
	reg := kbRegistry(m)
	if existing, ok := reg[name]; ok && existing != path {
		return &NameConflictError{Name: name, ExistingPath: existing}
	}
	reg[name] = path
	m[kbRegistryKey] = reg

	data, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(cfgPath, data, 0644)
}

// ResolveKnowledgeBasePath returns the registered path for a KB name.
func ResolveKnowledgeBasePath(name string) (string, error) {
	m, _, err := loadConfigFileMap()
	if err != nil {
		return "", err
	}
	path, ok := kbRegistry(m)[name]
	if !ok {
		return "", fmt.Errorf("knowledge base %q is not registered on this machine, run 'mindstack link <kb-path>' to register it", name)
	}
	return path, nil
}

// ListKnowledgeBases returns all registered KB name -> path mappings.
func ListKnowledgeBases() (map[string]string, error) {
	m, _, err := loadConfigFileMap()
	if err != nil {
		return nil, err
	}
	return kbRegistry(m), nil
}
