package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"mindstack/internal/config"
	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var kbName string
var configPath string

var rootCmd = &cobra.Command{
	Use:           "mindstack",
	Short:         "MindStack CLI for AI codegen tools",
	SilenceUsage:  true,
	SilenceErrors: true,
	CompletionOptions: cobra.CompletionOptions{
		DisableDefaultCmd: true,
	},
}

func init() {
	rootCmd.PersistentFlags().StringVar(&kbName, "kb", "", "knowledge base name (required when multiple KBs are linked)")
	rootCmd.PersistentFlags().StringVar(&configPath, "config", "", "path to config file (JSON)")

	rootCmd.PersistentPreRun = func(cmd *cobra.Command, args []string) {
		if configPath != "" {
			config.SetCustomConfigPath(configPath)
		}
	}

	rootCmd.AddCommand(initCmd)
	rootCmd.AddCommand(linkCmd)
	rootCmd.AddCommand(infoCmd)
	rootCmd.AddCommand(docCmd)
	rootCmd.AddCommand(tagsCmd)
	rootCmd.AddCommand(searchCmd)
	rootCmd.AddCommand(buildCmd)
	rootCmd.AddCommand(ackCmd)
}

// resolveRoot finds the knowledge base root path.
// If --kb is set, looks up the linked KB by name.
// Otherwise walks up from cwd to find a local .mindstack.
func resolveRoot() string {
	dir, err := os.Getwd()
	if err != nil {
		writeError(1, "INTERNAL", fmt.Sprintf("cannot get cwd: %v", err))
	}

	if kbName != "" {
		kbDir, err := workspace.FindKnowledgeBase(dir)
		if err != nil {
			writeError(2, "NOT_INITIALIZED", err.Error())
		}
		kbs, err := workspace.ResolveKnowledgeBases(kbDir)
		if err != nil {
			writeError(1, "RESOLVE_FAILED", err.Error())
		}
		for _, kb := range kbs {
			if kb.Name == kbName {
				return kb.Path
			}
		}
		writeError(1, "KB_NOT_FOUND", fmt.Sprintf("knowledge base %q not found, available: %v", kbName, kbNames(kbs)))
	}

	kbDir, err := workspace.FindKnowledgeBase(dir)
	if err != nil {
		writeError(2, "NOT_INITIALIZED", err.Error())
	}

	cfgPath := filepath.Join(kbDir, workspace.KnowledgeBaseDir, "config.yaml")
	cfg, err := config.LoadConfig(cfgPath)
	if err != nil {
		writeError(1, "CONFIG_ERROR", fmt.Sprintf("cannot read config: %v", err))
	}

	if cfg.IsKnowledgeBase() {
		return kbDir
	}

	kbs, err := workspace.ResolveKnowledgeBases(kbDir)
	if err != nil {
		writeError(1, "RESOLVE_FAILED", err.Error())
	}
	if len(kbs) == 1 {
		return kbs[0].Path
	}
	writeError(1, "KB_AMBIGUOUS", fmt.Sprintf("multiple knowledge bases linked, use --kb to specify one: %v", kbNames(kbs)))
	return ""
}

func kbNames(kbs []workspace.KBInfo) []string {
	names := make([]string, len(kbs))
	for i, kb := range kbs {
		names[i] = kb.Name
	}
	return names
}

// requireRoot resolves the root and ensures it's a valid knowledge base.
func requireRoot() string {
	root := resolveRoot()
	if !workspace.IsKnowledgeBaseInit(root) {
		writeError(2, "NOT_INITIALIZED", fmt.Sprintf("%s is not a knowledge base, run 'mindstack init' first", root))
	}
	return root
}

// validatePathSafe checks that targetPath stays within rootPath without requiring it to exist.
func validatePathSafe(rootPath, targetPath string) error {
	if !filepath.IsAbs(targetPath) {
		return fmt.Errorf("relative path not allowed")
	}
	cleanPath := filepath.Clean(targetPath)
	cleanRoot := filepath.Clean(rootPath)
	rel, err := filepath.Rel(cleanRoot, cleanPath)
	if err != nil {
		return fmt.Errorf("cannot compute relative path: %w", err)
	}
	if strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return fmt.Errorf("path escapes workspace")
	}
	return nil
}
