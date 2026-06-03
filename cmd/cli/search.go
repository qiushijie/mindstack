package main

import (
	"os"
	"path/filepath"
	"strings"

	"mindstack/internal/meta"
	"mindstack/internal/search"

	"github.com/spf13/cobra"
)

var searchFulltext bool

var searchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search documents by tag (comma-separated for AND) or full text",
	Long: `Search documents by tag or full text.

Tag search (default):
  mindstack search <tag>
  mindstack search <tag1>,<tag2>     -- AND semantics
  mindstack search "tag1 , tag2"     -- spaces are trimmed

Full text search:
  mindstack search --fulltext <keyword>`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		if searchFulltext {
			type resultItem struct {
				Path          string `json:"path"`
				Title         string `json:"title"`
				Score         int    `json:"score"`
				MatchTitle    int    `json:"matchTitle"`
				MatchSummary  int    `json:"matchSummary"`
				MatchHeadings int    `json:"matchHeadings"`
			}

			query := strings.ToLower(args[0])
			metas, err := meta.ScanAll(root, "")
			if err != nil {
				writeError(1, "SCAN_FAILED", err.Error())
			}

			var results []resultItem
			for _, m := range metas {
				absPath := filepath.Join(root, m.Path)
				data, err := os.ReadFile(absPath)
				if err != nil {
					continue
				}
				content := strings.ToLower(string(data))
				titleHits := strings.Count(strings.ToLower(m.Title), query)
				summaryHits := strings.Count(strings.ToLower(m.Summary), query)
				headingsHits := 0
				for _, h := range m.Headings {
					headingsHits += strings.Count(strings.ToLower(h.Text), query)
				}
				contentHits := strings.Count(content, query)
				score := titleHits*4 + summaryHits*3 + headingsHits*3 + contentHits
				if score > 0 {
					results = append(results, resultItem{
						Path:          absPath,
						Title:         m.Title,
						Score:         score,
						MatchTitle:    titleHits,
						MatchSummary:  summaryHits,
						MatchHeadings: headingsHits,
					})
				}
			}

			ftResult := map[string]interface{}{
				"query":   args[0],
				"mode":    "fulltext",
				"results": results,
				"total":   len(results),
			}
			saveToHistory(root, args[0], ftResult)
			writeJSON(ftResult)
			return
		}

		result, err := search.SearchByTag(root, args[0], "", true)
		if err != nil {
			writeError(1, "SEARCH_FAILED", err.Error())
		}
		tagResult := map[string]interface{}{
			"query":   args[0],
			"mode":    "tag",
			"results": result.Items,
			"total":   result.Total,
		}
		saveToHistory(root, args[0], tagResult)
		writeJSON(tagResult)
	},
}

func init() {
	searchCmd.Flags().BoolVar(&searchFulltext, "fulltext", false, "search by full text instead of tag")
}
