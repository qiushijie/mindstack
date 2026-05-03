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
	Short: "Search documents by tag or full text",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		if searchFulltext {
			type resultItem struct {
				Path       string `json:"path"`
				Title      string `json:"title"`
				MatchCount int    `json:"matchCount"`
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
				count := strings.Count(content, query)
				if count > 0 {
					results = append(results, resultItem{
						Path:       absPath,
						Title:      m.Title,
						MatchCount: count,
					})
				}
			}

			writeJSON(map[string]interface{}{
				"query":   args[0],
				"mode":    "fulltext",
				"results": results,
				"total":   len(results),
			})
			return
		}

		result, err := search.SearchByTag(root, args[0], "", true)
		if err != nil {
			writeError(1, "SEARCH_FAILED", err.Error())
		}
		writeJSON(map[string]interface{}{
			"query":   args[0],
			"mode":    "tag",
			"results": result.Items,
			"total":   result.Total,
		})
	},
}

func init() {
	searchCmd.Flags().BoolVar(&searchFulltext, "fulltext", false, "search by full text instead of tag")
}
