package meta

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"mindstack/internal/workspace"
)

const maxMetaSize = 16 * 1024 * 1024 // 16MB

// validateMetaPath ensures path is a safe document path relative to kbRoot.
// It rejects empty paths, absolute paths, and any path that escapes kbRoot.
func validateMetaPath(kbRoot, path string) (string, error) {
	if path == "" {
		return "", fmt.Errorf("empty meta path")
	}
	if filepath.IsAbs(path) {
		return "", fmt.Errorf("absolute meta path not allowed: %s", path)
	}
	cleaned := filepath.Clean(path)
	if cleaned == "." {
		return "", fmt.Errorf("meta path must be a document file: %s", path)
	}
	ext := strings.ToLower(filepath.Ext(cleaned))
	if ext != ".md" && ext != ".markdown" {
		return "", fmt.Errorf("meta path must be a markdown document: %s", path)
	}
	rel, err := filepath.Rel(filepath.Clean(kbRoot), filepath.Join(kbRoot, cleaned))
	if err != nil {
		return "", fmt.Errorf("invalid meta path %q: %w", path, err)
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("meta path escapes workspace: %s", path)
	}
	return cleaned, nil
}

// Heading represents a document section heading with its hierarchy level.
type Heading struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
}

// DocumentMeta holds metadata for a single markdown document.
type DocumentMeta struct {
	Path        string    `yaml:"-" json:"path,omitempty"`
	Title       string    `yaml:"title" json:"title"`
	Summary     string    `yaml:"summary" json:"summary"`
	Tags        []string  `yaml:"tags" json:"tags"`
	Headings    []Heading `yaml:"headings" json:"headings"`
	Status      string    `yaml:"status" json:"status"`
	ContentHash string    `yaml:"-" json:"contentHash,omitempty"`
	Keywords    []string  `yaml:"keywords" json:"keywords,omitempty"`
	Aliases     []string  `yaml:"aliases" json:"aliases,omitempty"`
}

// metaStore is the on-disk format: map from doc path to metadata.
type metaStore map[string]*DocumentMeta

func metaFilePath(kbRoot string) string {
	return filepath.Join(kbRoot, workspace.KnowledgeBaseDir, "meta.json")
}

func loadAll(kbRoot string) (metaStore, error) {
	path := metaFilePath(kbRoot)
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return make(metaStore), nil
		}
		return nil, fmt.Errorf("stat meta file: %w", err)
	}
	if info.Size() > maxMetaSize {
		return nil, fmt.Errorf("meta file %s too large: %d bytes exceeds %d byte limit", path, info.Size(), maxMetaSize)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read meta file: %w", err)
	}
	var store metaStore
	if err := json.Unmarshal(data, &store); err != nil {
		return nil, fmt.Errorf("parse meta file: %w", err)
	}
	return store, nil
}

func saveAll(kbRoot string, store metaStore) error {
	dir := filepath.Join(kbRoot, workspace.KnowledgeBaseDir)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create meta dir: %w", err)
	}
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal meta store: %w", err)
	}
	return os.WriteFile(metaFilePath(kbRoot), data, 0644)
}

// LoadMeta reads metadata for a document.
// docRelPath is relative to workspace root, e.g. "api-specs/rest-api.md".
func LoadMeta(kbRoot, docRelPath string) (*DocumentMeta, error) {
	cleaned, err := validateMetaPath(kbRoot, docRelPath)
	if err != nil {
		return nil, fmt.Errorf("invalid document path: %w", err)
	}
	store, err := loadAll(kbRoot)
	if err != nil {
		return nil, err
	}
	m, ok := store[cleaned]
	if !ok {
		return nil, fmt.Errorf("meta not found for %s", cleaned)
	}
	m.Path = cleaned
	return m, nil
}

// SaveMeta writes metadata for a document.
// docRelPath is relative to workspace root, e.g. "api-specs/rest-api.md".
func SaveMeta(kbRoot, docRelPath string, m *DocumentMeta) error {
	cleaned, err := validateMetaPath(kbRoot, docRelPath)
	if err != nil {
		return fmt.Errorf("invalid document path: %w", err)
	}
	store, err := loadAll(kbRoot)
	if err != nil {
		return err
	}
	if store == nil {
		store = make(metaStore)
	}
	m.Path = "" // path is stored as the map key, not in the value
	store[cleaned] = m
	return saveAll(kbRoot, store)
}

// ScanAll returns all metadata entries.
// subdir limits results to a subdirectory prefix (empty = all).
func ScanAll(kbRoot, subdir string) ([]*DocumentMeta, error) {
	store, err := loadAll(kbRoot)
	if err != nil {
		return nil, err
	}
	var results []*DocumentMeta
	for path, m := range store {
		cleaned, err := validateMetaPath(kbRoot, path)
		if err != nil {
			// Skip corrupted or malicious entries instead of breaking the whole KB.
			continue
		}
		if subdir != "" && !strings.HasPrefix(cleaned, subdir+"/") && cleaned != subdir {
			continue
		}
		m.Path = cleaned
		results = append(results, m)
	}
	return results, nil
}

// RemoveStale deletes meta entries for paths not in existingFiles.
// Returns the list of removed paths.
func RemoveStale(kbRoot string, existingFiles map[string]bool) ([]string, error) {
	store, err := loadAll(kbRoot)
	if err != nil {
		return nil, err
	}
	var removed []string
	for path := range store {
		if !existingFiles[path] {
			delete(store, path)
			removed = append(removed, path)
		}
	}
	if len(removed) > 0 {
		if err := saveAll(kbRoot, store); err != nil {
			return nil, err
		}
	}
	return removed, nil
}

// FindByTag filters meta list by tag(s). Multiple tags can be separated by ",".
// If ignoreCase is true, matching is case-insensitive.
// A document matches only if it has ALL of the specified tags (AND semantics).
func FindByTag(metas []*DocumentMeta, tag string, ignoreCase bool) []*DocumentMeta {
	searchTags := strings.Split(tag, ",")
	var cleanTags []string
	for _, t := range searchTags {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if ignoreCase {
			cleanTags = append(cleanTags, strings.ToLower(t))
		} else {
			cleanTags = append(cleanTags, t)
		}
	}
	if len(cleanTags) == 0 {
		return nil
	}

	var matched []*DocumentMeta
	for _, m := range metas {
		docTags := make(map[string]struct{}, len(m.Tags))
		for _, t := range m.Tags {
			dt := t
			if ignoreCase {
				dt = strings.ToLower(t)
			}
			docTags[dt] = struct{}{}
		}
		allMatch := true
		for _, searchTag := range cleanTags {
			if _, ok := docTags[searchTag]; !ok {
				allMatch = false
				break
			}
		}
		if allMatch {
			matched = append(matched, m)
		}
	}
	return matched
}
