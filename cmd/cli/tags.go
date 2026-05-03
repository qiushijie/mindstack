package main

import (
	"sort"

	"mindstack/internal/meta"

	"github.com/spf13/cobra"
)

var tagsCmd = &cobra.Command{
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
			"tags":          tags,
			"totalTags":     len(tags),
			"totalDocuments": len(metas),
		})
	},
}
