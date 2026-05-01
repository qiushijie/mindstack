package relation

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"mindstack/internal/workspace"
)

const maxRelationSize = 4 * 1024 * 1024 // 4MB

// Relation represents a directed relationship between two documents.
type Relation struct {
	Source     string   `json:"source"`
	Target     string   `json:"target"`
	Score      float64  `json:"score"`
	Reason     string   `json:"reason"`
	SharedTags []string `json:"sharedTags"`
}

// Store maps source doc path to its relations.
type Store map[string][]Relation

func filePath(kbRoot string) string {
	return filepath.Join(kbRoot, workspace.KnowledgeBaseDir, "relations.json")
}

// Load reads the relation store from disk.
func Load(kbRoot string) (Store, error) {
	path := filePath(kbRoot)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return make(Store), nil
		}
		return nil, fmt.Errorf("read relations: %w", err)
	}
	if len(data) > maxRelationSize {
		return nil, fmt.Errorf("relations file too large")
	}
	var store Store
	if err := json.Unmarshal(data, &store); err != nil {
		return nil, fmt.Errorf("parse relations: %w", err)
	}
	if store == nil {
		return make(Store), nil
	}
	return store, nil
}

// Save writes the relation store to disk.
func Save(kbRoot string, store Store) error {
	dir := filepath.Join(kbRoot, workspace.KnowledgeBaseDir)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create dir: %w", err)
	}
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal relations: %w", err)
	}
	return os.WriteFile(filePath(kbRoot), data, 0644)
}

// RemoveByDoc deletes all relations where the given doc is source or target.
func RemoveByDoc(store Store, docPath string) {
	delete(store, docPath)
	for src, rels := range store {
		filtered := make([]Relation, 0, len(rels))
		for _, r := range rels {
			if r.Target != docPath {
				filtered = append(filtered, r)
			}
		}
		if len(filtered) == 0 {
			delete(store, src)
		} else {
			store[src] = filtered
		}
	}
}

// AddRelations merges new relations into the store, deduplicating by (Source, Target).
func AddRelations(store Store, relations []Relation) {
	for _, r := range relations {
		existing := store[r.Source]
		dup := false
		for _, e := range existing {
			if e.Target == r.Target {
				dup = true
				break
			}
		}
		if !dup {
			store[r.Source] = append(existing, r)
		}
	}
}
