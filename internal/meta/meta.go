package meta

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"mindstack/internal/workspace"
)

const maxMetaSize = 2 * 1024 * 1024 // 2MB

// DocumentMeta holds metadata for a single markdown document.
type DocumentMeta struct {
	Path        string   `yaml:"-" json:"path,omitempty"`
	Title       string   `yaml:"title" json:"title"`
	Summary     string   `yaml:"summary" json:"summary"`
	Tags        []string `yaml:"tags" json:"tags"`
	Status      string   `yaml:"status" json:"status"`
	ContentHash string   `yaml:"-" json:"contentHash,omitempty"`
}

// metaStore is the on-disk format: map from doc path to metadata.
type metaStore map[string]*DocumentMeta

func metaFilePath(kbRoot string) string {
	return filepath.Join(kbRoot, workspace.KnowledgeBaseDir, "meta.json")
}

func loadAll(kbRoot string) (metaStore, error) {
	path := metaFilePath(kbRoot)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return make(metaStore), nil
		}
		return nil, fmt.Errorf("read meta file: %w", err)
	}
	if len(data) > maxMetaSize {
		return nil, fmt.Errorf("meta file too large")
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
	store, err := loadAll(kbRoot)
	if err != nil {
		return nil, err
	}
	m, ok := store[docRelPath]
	if !ok {
		return nil, fmt.Errorf("meta not found for %s", docRelPath)
	}
	m.Path = docRelPath
	return m, nil
}

// SaveMeta writes metadata for a document.
func SaveMeta(kbRoot, docRelPath string, m *DocumentMeta) error {
	store, err := loadAll(kbRoot)
	if err != nil {
		return err
	}
	if store == nil {
		store = make(metaStore)
	}
	m.Path = "" // path is stored as the map key, not in the value
	store[docRelPath] = m
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
		if subdir != "" && !strings.HasPrefix(path, subdir+"/") && path != subdir {
			continue
		}
		m.Path = path
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

// FindByTag filters meta list by tag.
// If ignoreCase is true, matching is case-insensitive.
func FindByTag(metas []*DocumentMeta, tag string, ignoreCase bool) []*DocumentMeta {
	var matched []*DocumentMeta
	searchTag := tag
	if ignoreCase {
		searchTag = strings.ToLower(tag)
	}
	for _, m := range metas {
		for _, t := range m.Tags {
			docTag := t
			if ignoreCase {
				docTag = strings.ToLower(t)
			}
			if docTag == searchTag {
				matched = append(matched, m)
				break
			}
		}
	}
	return matched
}
