package main

import (
	"path/filepath"

	"mindstack/internal/meta"
	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var metaCmd = &cobra.Command{
	Use:   "meta <absolute-path>",
	Short: "Show document metadata (absolute path)",
	Args:  cobra.ExactArgs(1),
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

		m, err := meta.LoadMeta(root, relPath)
		if err != nil {
			writeJSON(map[string]interface{}{
				"path":  absPath,
				"found": false,
			})
			return
		}

		writeJSON(map[string]interface{}{
			"path":        absPath,
			"found":       true,
			"title":       m.Title,
			"summary":     m.Summary,
			"tags":        m.Tags,
			"status":      m.Status,
			"contentHash": m.ContentHash,
		})
	},
}
