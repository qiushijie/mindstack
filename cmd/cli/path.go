package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var pathCmd = &cobra.Command{
	Use:   "path <relative-path>",
	Short: "Join relative path with KB root and verify it exists",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()
		absPath := filepath.Join(root, args[0])

		if _, err := os.Stat(absPath); err != nil {
			if os.IsNotExist(err) {
				writeError(1, "NOT_FOUND", "file not found: "+absPath)
			} else {
				writeError(1, "PATH_ERROR", "cannot access "+absPath+": "+err.Error())
			}
		}

		fmt.Fprintln(stdoutWriter, absPath)
	},
}

func init() {
	rootCmd.AddCommand(pathCmd)
}
