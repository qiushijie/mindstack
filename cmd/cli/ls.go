package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var lsCmd = &cobra.Command{
	Use:   "ls [path]",
	Short: "List documents in the knowledge base",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		prefix := ""
		if len(args) > 0 {
			prefix = args[0]
		}

		type docEntry struct {
			Path  string `json:"path"`
			Name  string `json:"name"`
			IsDir bool   `json:"isDir"`
		}

		var documents []docEntry
		seen := map[string]bool{}

		searchRoot := root
		if prefix != "" {
			searchRoot = filepath.Join(root, prefix)
		}

		if err := filepath.WalkDir(searchRoot, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if path == searchRoot {
				return nil
			}

			if d.IsDir() {
				if d.Name() == workspace.KnowledgeBaseDir || strings.HasPrefix(d.Name(), ".") {
					return filepath.SkipDir
				}
				if !seen[path] {
					documents = append(documents, docEntry{Path: path, Name: d.Name(), IsDir: true})
					seen[path] = true
				}
				return nil
			}

			ext := strings.ToLower(filepath.Ext(d.Name()))
			if ext == ".md" || ext == ".markdown" {
				if !seen[path] {
					documents = append(documents, docEntry{Path: path, Name: d.Name(), IsDir: false})
					seen[path] = true
				}
			}
			return nil
		}); err != nil {
			writeError(1, "WALK_FAILED", err.Error())
		}

		sort.Slice(documents, func(i, j int) bool {
			if documents[i].IsDir != documents[j].IsDir {
				return documents[i].IsDir
			}
			return strings.ToLower(documents[i].Name) < strings.ToLower(documents[j].Name)
		})

		writeJSON(map[string]interface{}{
			"root":      root,
			"prefix":    prefix,
			"documents": documents,
			"total":     len(documents),
		})
	},
}
