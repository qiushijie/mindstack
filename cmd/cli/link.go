package main

import (
	"errors"
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

		if workspace.IsKnowledgeBaseInit(cwd) {
			writeError(1, "IS_KB", "current directory is a knowledge base, not a project link directory")
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

		if err := config.RegisterKnowledgeBase(name, kbPath); err != nil {
			var conflict *config.NameConflictError
			if errors.As(err, &conflict) {
				writeError(1, "NAME_CONFLICT", fmt.Sprintf("%s, use --name to specify an alias", err))
			}
			writeError(1, "REGISTER_FAILED", fmt.Sprintf("cannot register knowledge base: %v", err))
		}

		projectPath := filepath.Join(cwd, workspace.ProjectConfigFile)
		cfg := config.DefaultConfig()
		if _, err := os.Stat(projectPath); err == nil {
			cfg, err = config.LoadConfig(projectPath)
			if err != nil {
				writeError(1, "CONFIG_ERROR", fmt.Sprintf("cannot read project config: %v", err))
			}
		}

		for _, existing := range cfg.KnowledgeBases {
			if existing == name {
				writeError(1, "ALREADY_LINKED", fmt.Sprintf("knowledge base %s is already linked", name))
			}
		}

		cfg.KnowledgeBases = append(cfg.KnowledgeBases, name)
		if err := config.SaveConfig(projectPath, cfg); err != nil {
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
