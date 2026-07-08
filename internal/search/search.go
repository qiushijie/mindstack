package search

import "mindstack/internal/retrieval"

// SearchItem is a single search result.
type SearchItem struct {
	Path    string `json:"path"`
	Title   string `json:"title"`
	Summary string `json:"summary"`
}

// SearchResult holds search results.
type SearchResult struct {
	Tag   string       `json:"tag,omitempty"`
	Items []SearchItem `json:"items"`
	Total int          `json:"total"`
}

// SearchByTag searches documents by tag in the knowledge base.
// The ignoreCase parameter is retained for backward compatibility; matching is
// case-insensitive by default.
func SearchByTag(kbRoot, tag, subdir string, ignoreCase bool) (*SearchResult, error) {
	rs, err := retrieval.Search(kbRoot, retrieval.Query{
		Raw:  tag,
		Tags: retrieval.NormalizeTagQuery(tag),
	}, retrieval.Options{
		Mode:    retrieval.ModeTag,
		Subdir:  subdir,
		TagMode: retrieval.TagModeAND,
	})
	if err != nil {
		return nil, err
	}

	items := make([]SearchItem, 0, len(rs.Results))
	for _, r := range rs.Results {
		items = append(items, SearchItem{
			Path:    r.Path,
			Title:   r.Title,
			Summary: r.Summary,
		})
	}

	return &SearchResult{
		Tag:   tag,
		Items: items,
		Total: len(items),
	}, nil
}

