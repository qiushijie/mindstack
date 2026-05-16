package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mindstack/internal/meta"
	"mindstack/internal/relation"
	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var docCmd = &cobra.Command{
	Use:   "doc",
	Short: "Document operations",
	Long: `Operations on individual documents in the knowledge base.

Subcommands:
  doc ls [path]              -- List documents
  doc meta <absolute-path>   -- Show document metadata
  doc relation <absolute-path> -- Show document relations`,
}

var docLsCmd = &cobra.Command{
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

var docMetaCmd = &cobra.Command{
	Use:   "meta <absolute-path>",
	Short: "Show document metadata",
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

var docRelationCmd = &cobra.Command{
	Use:   "relation <absolute-path>",
	Short: "Show relations for a specific document",
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
					Type:       r.Type,
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
						Type:       r.Type,
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

func init() {
	docCmd.AddCommand(docLsCmd)
	docCmd.AddCommand(docMetaCmd)
	docCmd.AddCommand(docRelationCmd)
	rootCmd.AddCommand(docCmd)
}
