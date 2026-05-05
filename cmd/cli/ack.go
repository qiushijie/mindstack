package main

import (
	"context"
	"fmt"

	"mindstack/internal/ack"
	"mindstack/internal/config"
	"mindstack/internal/llm"

	"github.com/spf13/cobra"
)

var ackCmd = &cobra.Command{
	Use:   "ack <query>",
	Short: "Ask a question and return relevant document snippets from the knowledge base",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		svc := llm.NewService(config.ConfigPath())
		if err := svc.InitFromConfig(); err != nil {
			writeError(3, "LLM_UNAVAILABLE", fmt.Sprintf("cannot init LLM service: %v", err))
		}

		result, err := ack.Ack(context.Background(), svc, root, args[0], "")
		if err != nil {
			writeError(1, "ACK_FAILED", err.Error())
		}

		writeJSON(result)
	},
}
