package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"mindstack/internal/config"
)

const KnowledgeBaseDir = ".mindstack"

// ProjectConfigFile is the committable link file at a project root. It lists
// knowledge base names; the name -> local path mapping lives in the global
// config.json registry.
const ProjectConfigFile = "mindstack.yaml"

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

// FindKnowledgeBase walks up from startDir looking for a knowledge base
// (.mindstack/config.yaml) or a linked project (mindstack.yaml).
// Returns the directory containing the marker, not the marker itself.
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
		projectPath := filepath.Join(dir, ProjectConfigFile)
		if _, err := os.Stat(projectPath); err == nil {
			return dir, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("no knowledge base found from %s, run 'mindstack init' or 'mindstack link' first", startDir)
		}
		dir = parent
	}
}

// ResolveKnowledgeBases resolves all knowledge bases for a directory.
// If dir is a knowledge base itself (.mindstack/config.yaml), returns its own
// dir with name from config. This check takes priority, matching
// FindKnowledgeBase, so a KB containing a stray mindstack.yaml still resolves
// as itself.
// Otherwise, if dir has a mindstack.yaml (link mode), resolves each listed KB
// name to a local path via the global registry. Duplicate names are resolved
// once, keeping first occurrence order.
func ResolveKnowledgeBases(dir string) ([]KBInfo, error) {
	configPath := filepath.Join(dir, KnowledgeBaseDir, "config.yaml")
	if _, err := os.Stat(configPath); err == nil {
		cfg, err := config.LoadConfig(configPath)
		if err != nil {
			return nil, fmt.Errorf("cannot read config: %w", err)
		}
		name := cfg.Name
		if name == "" {
			name = filepath.Base(dir)
		}
		return []KBInfo{{Name: name, Path: dir}}, nil
	}

	projectPath := filepath.Join(dir, ProjectConfigFile)
	if _, err := os.Stat(projectPath); err == nil {
		cfg, err := config.LoadConfig(projectPath)
		if err != nil {
			return nil, fmt.Errorf("cannot read project config: %w", err)
		}
		names := cfg.GetKnowledgeBases()
		if len(names) == 0 {
			return nil, fmt.Errorf("no knowledge bases listed in %s", projectPath)
		}
		var result []KBInfo
		seen := map[string]bool{}
		for _, name := range names {
			if seen[name] {
				continue
			}
			seen[name] = true
			path, err := config.ResolveKnowledgeBasePath(name)
			if err != nil {
				return nil, err
			}
			if !IsKnowledgeBaseInit(path) {
				return nil, fmt.Errorf("registered path for knowledge base %q is no longer a knowledge base: %s, run 'mindstack link <kb-path>' to re-register", name, path)
			}
			result = append(result, KBInfo{Name: name, Path: path})
		}
		return result, nil
	}

	return nil, fmt.Errorf("cannot read config: %w", os.ErrNotExist)
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
