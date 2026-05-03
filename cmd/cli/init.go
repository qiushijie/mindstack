package main

import (
	"fmt"
	"os"
	"path/filepath"

	"mindstack/internal/config"
	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var initCmd = &cobra.Command{
	Use:   "init [path]",
	Short: "Initialize a new knowledge base",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		target := "."
		if len(args) > 0 {
			target = args[0]
		}

		absPath, err := filepath.Abs(target)
		if err != nil {
			writeError(1, "INVALID_PATH", fmt.Sprintf("cannot resolve path: %v", err))
		}

		if workspace.IsKnowledgeBaseInit(absPath) {
			writeError(1, "ALREADY_EXISTS", fmt.Sprintf("knowledge base already initialized at %s", absPath))
		}

		kbDir := filepath.Join(absPath, workspace.KnowledgeBaseDir)
		if err := os.MkdirAll(kbDir, 0755); err != nil {
			writeError(1, "MKDIR_FAILED", fmt.Sprintf("cannot create .mindstack: %v", err))
		}

		cfg := config.DefaultConfig()
		cfg.Name = filepath.Base(absPath)
		cfgPath := filepath.Join(kbDir, "config.yaml")
		if err := config.SaveConfig(cfgPath, cfg); err != nil {
			writeError(1, "SAVE_FAILED", fmt.Sprintf("cannot save config: %v", err))
		}

		writeJSON(map[string]interface{}{
			"initialized": true,
			"path":        absPath,
			"configPath":  cfgPath,
		})
	},
}
