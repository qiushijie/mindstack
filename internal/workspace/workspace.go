package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"mindstack/internal/config"
)

const KnowledgeBaseDir = ".mindstack"

// KBInfo holds resolved knowledge base info.
type KBInfo struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// ValidatePath checks that targetPath stays within rootPath.
func ValidatePath(rootPath, targetPath string) error {
	if !filepath.IsAbs(targetPath) {
		return fmt.Errorf("relative path not allowed")
	}

	cleanPath := filepath.Clean(targetPath)

	resolvedPath, err := filepath.EvalSymlinks(cleanPath)
	if err != nil {
		return fmt.Errorf("cannot resolve path: %w", err)
	}

	resolvedRoot, err := filepath.EvalSymlinks(filepath.Clean(rootPath))
	if err != nil {
		return fmt.Errorf("cannot resolve root: %w", err)
	}

	rel, err := filepath.Rel(resolvedRoot, resolvedPath)
	if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return fmt.Errorf("path escapes workspace")
	}

	return nil
}

// FindKnowledgeBase walks up from startDir looking for .mindstack/config.yaml.
// Returns the directory containing .mindstack/ (the project root), not the .mindstack dir itself.
func FindKnowledgeBase(startDir string) (string, error) {
	absDir, err := filepath.Abs(startDir)
	if err != nil {
		return "", fmt.Errorf("cannot resolve start dir: %w", err)
	}

	dir := absDir
	for {
		configPath := filepath.Join(dir, KnowledgeBaseDir, "config.yaml")
		if _, err := os.Stat(configPath); err == nil {
			return dir, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("no knowledge base found from %s, run 'mindstack init' first", startDir)
		}
		dir = parent
	}
}

// ResolveKnowledgeBases reads the config and resolves all linked knowledge bases.
// If config has knowledge_bases entries (link mode), returns resolved paths with names.
// If it's a knowledge base itself, returns its own dir with name from config.
func ResolveKnowledgeBases(kbDir string) ([]KBInfo, error) {
	configPath := filepath.Join(kbDir, KnowledgeBaseDir, "config.yaml")
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		return nil, fmt.Errorf("cannot read config: %w", err)
	}

	links := cfg.GetKnowledgeBases()
	if len(links) > 0 {
		var result []KBInfo
		for _, link := range links {
			abs, err := filepath.Abs(link)
			if err != nil {
				continue
			}
			name := resolveKBName(abs)
			result = append(result, KBInfo{Name: name, Path: abs})
		}
		if len(result) == 0 {
			return nil, fmt.Errorf("no valid knowledge bases found in config")
		}
		return result, nil
	}

	// It's a knowledge base itself
	name := cfg.Name
	if name == "" {
		name = filepath.Base(kbDir)
	}
	return []KBInfo{{Name: name, Path: kbDir}}, nil
}

// resolveKBName reads the name from a knowledge base's config.
func resolveKBName(kbPath string) string {
	configPath := filepath.Join(kbPath, KnowledgeBaseDir, "config.yaml")
	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		return filepath.Base(kbPath)
	}
	if cfg.Name != "" {
		return cfg.Name
	}
	return filepath.Base(kbPath)
}

// ResolveFirstKnowledgeBase is a convenience wrapper that returns the first KB root path.
func ResolveFirstKnowledgeBase(kbDir string) (string, error) {
	kbs, err := ResolveKnowledgeBases(kbDir)
	if err != nil {
		return "", err
	}
	return kbs[0].Path, nil
}

// IsKnowledgeBaseInit checks if dir has a .mindstack/ directory.
func IsKnowledgeBaseInit(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, KnowledgeBaseDir))
	return err == nil && info.IsDir()
}
