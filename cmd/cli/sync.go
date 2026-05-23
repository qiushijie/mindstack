package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"mindstack/internal/config"
	"mindstack/internal/llm"
	syncpkg "mindstack/internal/sync"

	"github.com/spf13/cobra"
)

var syncForce bool

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync workspace (generate metadata and relations)",
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		svc := llm.NewService(config.ResolveConfigPath())
		if err := svc.InitFromConfig(); err != nil {
			writeError(3, "LLM_UNAVAILABLE", fmt.Sprintf("cannot init LLM service: %v", err))
		}

		var processed, skipped int
		var errs []string

		err := syncpkg.SyncWorkspace(context.Background(), svc, root, syncForce, func(p syncpkg.SyncProgress) {
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
			writeError(1, "SYNC_FAILED", err.Error())
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
	syncCmd.Flags().BoolVar(&syncForce, "force", false, "force reprocess all files, ignoring existing metadata")
}
