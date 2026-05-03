package main

import (
	"path/filepath"

	"mindstack/internal/config"
	"mindstack/internal/meta"
	"mindstack/internal/relation"
	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var infoCmd = &cobra.Command{
	Use:   "info",
	Short: "Show knowledge base overview",
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		cfgPath := filepath.Join(root, workspace.KnowledgeBaseDir, "config.yaml")
		cfg, err := config.LoadConfig(cfgPath)
		if err != nil {
			writeError(1, "CONFIG_ERROR", err.Error())
		}

		metas, err := meta.ScanAll(root, "")
		if err != nil {
			writeError(1, "SCAN_FAILED", err.Error())
		}
		docCount := len(metas)

		relStore, err := relation.Load(root)
		if err != nil {
			writeError(1, "RELATION_FAILED", err.Error())
		}
		relCount := 0
		for _, rels := range relStore {
			relCount += len(rels)
		}

		var kbs []map[string]string
		resolved, err := workspace.ResolveKnowledgeBases(root)
		if err != nil {
			writeError(1, "RESOLVE_FAILED", err.Error())
		}
		for _, kb := range resolved {
			kbs = append(kbs, map[string]string{"name": kb.Name, "path": kb.Path})
		}

		writeJSON(map[string]interface{}{
			"root":            root,
			"name":            cfg.Name,
			"version":         cfg.Version,
			"documentCount":   docCount,
			"relationCount":   relCount,
			"knowledgeBases":  kbs,
		})
	},
}
