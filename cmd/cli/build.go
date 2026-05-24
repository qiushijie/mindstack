package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"mindstack/internal/config"
	"mindstack/internal/llm"
	buildpkg "mindstack/internal/build"

	"github.com/spf13/cobra"
)

var buildForce bool

var buildCmd = &cobra.Command{
	Use:   "build",
	Short: "Build workspace (generate metadata and relations)",
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		if buildForce {
			fmt.Fprintln(os.Stderr, "WARNING: --force will reprocess ALL files and overwrite existing metadata. This may consume significant LLM tokens.")
			fmt.Fprint(os.Stderr, "Are you sure you want to continue? [Y/n] ")
			var input string
			fmt.Scanln(&input)
			if input != "Y" {
				fmt.Fprintln(os.Stderr, "Aborted.")
				os.Exit(0)
			}
		}

		svc := llm.NewService(config.ResolveConfigPath())
		if err := svc.InitFromConfig(); err != nil {
			writeError(3, "LLM_UNAVAILABLE", fmt.Sprintf("cannot init LLM service: %v", err))
		}

		var processed, skipped int
		var errs []string

		err := buildpkg.BuildWorkspace(context.Background(), svc, root, buildForce, func(p buildpkg.BuildProgress) {
			switch p.Status {
			case "done":
				processed++
			case "skipped":
				skipped++
			case "error":
				errs = append(errs, fmt.Sprintf("%s: %s", p.File, p.Error))
			}
			data, _ := json.Marshal(p)
			fmt.Fprintln(os.Stderr, string(data))
		})

		if err != nil {
			writeError(1, "BUILD_FAILED", err.Error())
		}

		writeJSON(map[string]interface{}{
			"root":           root,
			"status":         "complete",
			"filesProcessed": processed,
			"filesSkipped":   skipped,
			"errors":         errs,
		})
	},
}

func init() {
	buildCmd.Flags().BoolVar(&buildForce, "force", false, "force reprocess all files, ignoring existing metadata")
}
