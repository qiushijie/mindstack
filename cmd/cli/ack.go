package main

import (
	"context"
	"fmt"

	"mindstack/internal/ack"
	"mindstack/internal/chat"
	"mindstack/internal/config"
	"mindstack/internal/llm"

	"github.com/spf13/cobra"
)

var ackLang string

var ackCmd = &cobra.Command{
	Use:   "ack <query>",
	Short: "Ask a question and return relevant document snippets from the knowledge base",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		svc := llm.NewService(config.ResolveConfigPath())
		if err := svc.InitFromConfig(); err != nil {
			writeError(3, "LLM_UNAVAILABLE", fmt.Sprintf("cannot init LLM service: %v", err))
		}

		lang := ackLang
		switch lang {
		case "zh", "en":
			// explicit
		case "", "auto":
			lang = ack.AutoDetectLang(args[0])
		default:
			writeError(1, "ACK_FAILED", fmt.Sprintf("invalid lang: %s (want zh, en, or auto)", ackLang))
			return
		}

		result, err := ack.Ack(context.Background(), svc, root, args[0], lang)
		if err != nil {
			writeError(1, "ACK_FAILED", err.Error())
		}

		saveToHistory(root, chat.SessionKindAck, args[0], result)
		writeJSON(result)
	},
}

func init() {
	ackCmd.Flags().StringVar(&ackLang, "lang", "auto", "prompt language: zh, en, or auto (detect from query)")
}
