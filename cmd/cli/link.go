package main

import (
	"fmt"
	"os"
	"path/filepath"

	"mindstack/internal/config"
	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var linkName string

var linkCmd = &cobra.Command{
	Use:   "link <kb-path>",
	Short: "Link a knowledge base to current directory",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		kbPath, err := filepath.Abs(args[0])
		if err != nil {
			writeError(1, "INVALID_PATH", fmt.Sprintf("cannot resolve kb path: %v", err))
		}

		if !workspace.IsKnowledgeBaseInit(kbPath) {
			writeError(1, "NOT_A_KB", fmt.Sprintf("%s is not a knowledge base", kbPath))
		}

		cwd, err := os.Getwd()
		if err != nil {
			writeError(1, "INTERNAL", fmt.Sprintf("cannot get cwd: %v", err))
		}

		kbDir := filepath.Join(cwd, workspace.KnowledgeBaseDir)
		cfgPath := filepath.Join(kbDir, "config.yaml")

		var cfg *config.Config
		if workspace.IsKnowledgeBaseInit(cwd) {
			cfg, err = config.LoadConfig(cfgPath)
			if err != nil {
				writeError(1, "CONFIG_ERROR", fmt.Sprintf("cannot read config: %v", err))
			}
			if cfg.IsKnowledgeBase() {
				writeError(1, "IS_KB", "current directory is a knowledge base, not a project link directory")
			}
		} else {
			if err := os.MkdirAll(kbDir, 0755); err != nil {
				writeError(1, "MKDIR_FAILED", fmt.Sprintf("cannot create .mindstack: %v", err))
			}
			cfg = &config.Config{Version: "1"}
		}

		name := linkName
		if name == "" {
			kbs, err := workspace.ResolveKnowledgeBases(kbPath)
			if err == nil && len(kbs) > 0 {
				name = kbs[0].Name
			} else {
				name = filepath.Base(kbPath)
			}
		}

		for _, existing := range cfg.KnowledgeBases {
			if existing == kbPath {
				writeError(1, "ALREADY_LINKED", fmt.Sprintf("knowledge base %s is already linked", kbPath))
			}
		}

		cfg.KnowledgeBases = append(cfg.KnowledgeBases, kbPath)
		if err := config.SaveConfig(cfgPath, cfg); err != nil {
			writeError(1, "SAVE_FAILED", fmt.Sprintf("cannot save config: %v", err))
		}

		writeJSON(map[string]interface{}{
			"linked": true,
			"name":   name,
			"path":   kbPath,
		})
	},
}

func init() {
	linkCmd.Flags().StringVar(&linkName, "name", "", "alias name for the linked knowledge base")
}
