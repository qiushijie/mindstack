package main

import (
	"path/filepath"
	"sort"

	"mindstack/internal/meta"
	"mindstack/internal/relation"
	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var relatedCmd = &cobra.Command{
	Use:   "related",
	Short: "Explore relations, tags, and connections",
	Long: `Explore document relations, tags, and connections within the knowledge base.

Subcommands:
  related tags              -- List all tags and their document counts
  related docs <doc-path>   -- List outgoing related documents for a given document`,
}

var relatedTagsCmd = &cobra.Command{
	Use:   "tags",
	Short: "List all tags and their document counts",
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		metas, err := meta.ScanAll(root, "")
		if err != nil {
			writeError(1, "SCAN_FAILED", err.Error())
		}

		tagCount := map[string]int{}
		for _, m := range metas {
			for _, t := range m.Tags {
				tagCount[t]++
			}
		}

		type tagEntry struct {
			Name  string `json:"name"`
			Count int    `json:"count"`
		}

		tags := make([]tagEntry, 0, len(tagCount))
		for name, count := range tagCount {
			tags = append(tags, tagEntry{Name: name, Count: count})
		}
		sort.Slice(tags, func(i, j int) bool {
			if tags[i].Count != tags[j].Count {
				return tags[i].Count > tags[j].Count
			}
			return tags[i].Name < tags[j].Name
		})

		writeJSON(map[string]interface{}{
			"tags":           tags,
			"totalTags":      len(tags),
			"totalDocuments": len(metas),
		})
	},
}

var relatedDocsCmd = &cobra.Command{
	Use:   "docs <doc-path>",
	Short: "List outgoing related documents for the given document",
	Long: `List documents that the given document has outgoing relations to.

Only outgoing relations are included. Documents that point to the given
document via incoming relations are not shown.

Example:
  mindstack related docs /path/to/doc.md`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()
		absPath := args[0]

		if err := workspace.ValidatePath(root, absPath); err != nil {
			writeError(1, "INVALID_PATH", err.Error())
		}

		resolvedRoot, err := filepath.EvalSymlinks(filepath.Clean(root))
		if err != nil {
			writeError(1, "INVALID_PATH", err.Error())
		}
		resolvedAbs, err := filepath.EvalSymlinks(filepath.Clean(absPath))
		if err != nil {
			writeError(1, "INVALID_PATH", err.Error())
		}
		relPath, err := filepath.Rel(resolvedRoot, resolvedAbs)
		if err != nil {
			writeError(1, "INVALID_PATH", err.Error())
		}

		store, err := relation.Load(root)
		if err != nil {
			writeError(1, "LOAD_FAILED", err.Error())
		}

		related := make(map[string]bool)
		for _, r := range store[relPath] {
			related[r.Target] = true
		}

		var paths []string
		for p := range related {
			paths = append(paths, filepath.Join(root, p))
		}
		sort.Strings(paths)

		writeJSON(map[string]interface{}{
			"path":    absPath,
			"related": paths,
			"total":   len(paths),
		})
	},
}

func init() {
	relatedCmd.AddCommand(relatedTagsCmd)
	relatedCmd.AddCommand(relatedDocsCmd)
	rootCmd.AddCommand(relatedCmd)
}
