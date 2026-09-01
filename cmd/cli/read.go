package main

import (
	"fmt"
	"os"
	"path/filepath"

	"mindstack/internal/workspace"

	"github.com/spf13/cobra"
)

var readCmd = &cobra.Command{
	Use:   "read <path>",
	Short: "Read a document's content by relative or absolute path",
	Long: `Read a document and print its raw content to stdout.

The path may be relative to the knowledge base root or absolute.
Absolute paths must stay within the knowledge base.`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		absPath := args[0]
		if !filepath.IsAbs(absPath) {
			absPath = filepath.Join(root, absPath)
		}
		// The file must exist for EvalSymlinks inside ValidatePath; check first
		// so missing files get a clean NOT_FOUND instead of a resolve error.
		info, err := os.Stat(absPath)
		if err != nil {
			if os.IsNotExist(err) {
				writeError(1, "NOT_FOUND", "file not found: "+absPath)
			} else {
				writeError(1, "PATH_ERROR", "cannot access "+absPath+": "+err.Error())
			}
		}
		if info.IsDir() {
			writeError(1, "IS_DIRECTORY", "path is a directory: "+absPath)
		}
		if err := workspace.ValidatePath(root, absPath); err != nil {
			writeError(1, "INVALID_PATH", err.Error())
		}

		content, err := os.ReadFile(absPath)
		if err != nil {
			writeError(1, "READ_ERROR", fmt.Sprintf("cannot read %s: %v", absPath, err))
		}

		stdoutWriter.Write(content)
	},
}

func init() {
	rootCmd.AddCommand(readCmd)
}
