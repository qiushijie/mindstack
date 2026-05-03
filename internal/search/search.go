package search

import (
	"path/filepath"

	"mindstack/internal/meta"
)

// SearchItem is a single search result.
type SearchItem struct {
	Path  string `json:"path"`
	Title string `json:"title"`
}

// SearchResult holds tag search results.
type SearchResult struct {
	Tag   string       `json:"tag"`
	Items []SearchItem `json:"items"`
	Total int          `json:"total"`
}

// SearchByTag searches documents by tag in the knowledge base.
// If ignoreCase is true, matching is case-insensitive.
func SearchByTag(kbRoot, tag, subdir string, ignoreCase bool) (*SearchResult, error) {
	metas, err := meta.ScanAll(kbRoot, subdir)
	if err != nil {
		return nil, err
	}

	matched := meta.FindByTag(metas, tag, ignoreCase)

	items := make([]SearchItem, 0, len(matched))
	for _, m := range matched {
		items = append(items, SearchItem{
			Path:  filepath.Join(kbRoot, m.Path),
			Title: m.Title,
		})
	}

	return &SearchResult{
		Tag:   tag,
		Items: items,
		Total: len(items),
	}, nil
}
