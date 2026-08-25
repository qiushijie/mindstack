package meta

import (
	"fmt"
	"sync"
)

// Store is a batch handle over meta.json: the file is loaded once, updated in
// memory via Set, and persisted with a single Save. It avoids the
// read-modify-write cycle of SaveMeta when many documents are updated in one
// pass (e.g. during a build). Store is safe for concurrent use.
type Store struct {
	mu   sync.Mutex
	root string
	data metaStore
}

// OpenStore loads the meta store for kbRoot into memory.
func OpenStore(kbRoot string) (*Store, error) {
	data, err := loadAll(kbRoot)
	if err != nil {
		return nil, err
	}
	if data == nil {
		data = make(metaStore)
	}
	return &Store{root: kbRoot, data: data}, nil
}

// Get returns a copy of the metadata for docRelPath, or nil when the entry is
// absent or the path is invalid. The returned value is a deep copy: callers
// may mutate it (including the slice fields) without affecting the store.
func (s *Store) Get(docRelPath string) *DocumentMeta {
	cleaned, err := validateMetaPath(s.root, docRelPath)
	if err != nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	m, ok := s.data[cleaned]
	if !ok {
		return nil
	}
	cp := *m
	cp.Tags = append([]string(nil), m.Tags...)
	cp.Headings = append([]Heading(nil), m.Headings...)
	cp.Keywords = append([]string(nil), m.Keywords...)
	cp.Aliases = append([]string(nil), m.Aliases...)
	cp.Path = cleaned
	return &cp
}

// Set updates the in-memory metadata for docRelPath. The change is not
// persisted until Save is called. The store takes ownership of m: the caller
// must not mutate m after Set returns.
func (s *Store) Set(docRelPath string, m *DocumentMeta) error {
	cleaned, err := validateMetaPath(s.root, docRelPath)
	if err != nil {
		return fmt.Errorf("invalid document path: %w", err)
	}
	m.Path = "" // path is stored as the map key, not in the value
	s.mu.Lock()
	s.data[cleaned] = m
	s.mu.Unlock()
	return nil
}

// Save persists the in-memory store to disk in a single write.
func (s *Store) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return saveAll(s.root, s.data)
}
