package main

import (
	"path/filepath"

	"mindstack/internal/relation"
	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var relationCmd = &cobra.Command{
	Use:   "relation <absolute-path>",
	Short: "Show relations for a specific document (absolute path)",
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

		store, err := relation.Load(root)
		if err != nil {
			writeError(1, "LOAD_FAILED", err.Error())
		}

		var outgoing []relation.Relation
		var incoming []relation.Relation

		if rels, ok := store[relPath]; ok {
			for _, r := range rels {
				outgoing = append(outgoing, relation.Relation{
					Source:     filepath.Join(root, r.Source),
					Target:     filepath.Join(root, r.Target),
					Score:      r.Score,
					Reason:     r.Reason,
					SharedTags: r.SharedTags,
				})
			}
		}
		for src, rels := range store {
			if src == relPath {
				continue
			}
			for _, r := range rels {
				if r.Target == relPath {
					incoming = append(incoming, relation.Relation{
						Source:     filepath.Join(root, r.Source),
						Target:     filepath.Join(root, r.Target),
						Score:      r.Score,
						Reason:     r.Reason,
						SharedTags: r.SharedTags,
					})
				}
			}
		}

		writeJSON(map[string]interface{}{
			"path":          absPath,
			"outgoing":      outgoing,
			"incoming":      incoming,
			"totalOutgoing": len(outgoing),
			"totalIncoming": len(incoming),
		})
	},
}
