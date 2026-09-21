package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"

	"mindstack/internal/chat"
	"mindstack/internal/db"

	"github.com/spf13/cobra"
)

var historyLimit int

// openChatStore initializes the database and runs schema migrations. The CLI
// process is short-lived and may be the only writer for long stretches (the
// desktop app migrates on startup), so every entry point that touches chat
// history must migrate first — otherwise writes against a pre-migration
// database fail on unknown columns.
func openChatStore() (*chat.Store, error) {
	d, err := db.Init()
	if err != nil {
		return nil, err
	}
	store := chat.NewStore(d)
	if err := store.AutoMigrate(); err != nil {
		return nil, err
	}
	return store, nil
}

var historyCmd = &cobra.Command{
	Use:   "history",
	Short: "View conversation history for the current knowledge base",
}

var historyLsCmd = &cobra.Command{
	Use:   "ls",
	Short: "List chat sessions",
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		kbRoot := requireRoot()

		store, err := openChatStore()
		if err != nil {
			writeError(1, "DB_INIT_FAILED", err.Error())
		}

		sessions, err := store.ListRecentSessions(kbRoot, historyLimit)
		if err != nil {
			writeError(1, "QUERY_FAILED", err.Error())
		}

		type sessionSummary struct {
			ID            uint   `json:"id"`
			Title         string `json:"title"`
			WorkspacePath string `json:"workspacePath"`
			CreatedAt     string `json:"createdAt"`
			UpdatedAt     string `json:"updatedAt"`
			MessageCount  int64  `json:"messageCount"`
		}

		summaries := make([]sessionSummary, 0, len(sessions))
		for _, s := range sessions {
			count, _ := store.CountMessages(s.ID)
			summaries = append(summaries, sessionSummary{
				ID:            s.ID,
				Title:         s.Title,
				WorkspacePath: s.WorkspacePath,
				CreatedAt:     s.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				UpdatedAt:     s.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
				MessageCount:  count,
			})
		}

		writeJSON(map[string]interface{}{
			"sessions": summaries,
			"total":    len(summaries),
		})
	},
}

var historyShowCmd = &cobra.Command{
	Use:   "show <id>",
	Short: "Show query result for a session",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		sessionID, err := strconv.ParseUint(args[0], 10, 32)
		if err != nil {
			writeError(1, "INVALID_ID", "session ID must be a number")
		}

		store, err := openChatStore()
		if err != nil {
			writeError(1, "DB_INIT_FAILED", err.Error())
		}

		session, err := store.GetSession(uint(sessionID))
		if err != nil {
			writeError(1, "NOT_FOUND", fmt.Sprintf("session %d not found", sessionID))
		}
		if session.WorkspacePath != root {
			writeError(1, "NOT_FOUND", fmt.Sprintf("session %d not found", sessionID))
		}

		var query string
		var result interface{}
		for _, m := range session.Messages {
			if m.Role == "user" && query == "" {
				query = m.Content
			}
			if m.Role == "assistant" {
				var parsed interface{}
				if json.Unmarshal([]byte(m.Content), &parsed) == nil {
					result = parsed
				} else {
					result = m.Content
				}
			}
		}

		writeJSON(map[string]interface{}{
			"id":        session.ID,
			"title":     session.Title,
			"createdAt": session.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			"updatedAt": session.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
			"query":     query,
			"result":    result,
		})
	},
}

var historyDelCmd = &cobra.Command{
	Use:   "del <id>",
	Short: "Delete a chat session",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		sessionID, err := strconv.ParseUint(args[0], 10, 32)
		if err != nil {
			writeError(1, "INVALID_ID", "session ID must be a number")
		}

		store, err := openChatStore()
		if err != nil {
			writeError(1, "DB_INIT_FAILED", err.Error())
		}

		session, err := store.GetSession(uint(sessionID))
		if err != nil {
			writeError(1, "NOT_FOUND", fmt.Sprintf("session %d not found", sessionID))
		}
		if session.WorkspacePath != root {
			writeError(1, "NOT_FOUND", fmt.Sprintf("session %d not found", sessionID))
		}

		if err := store.DeleteSession(uint(sessionID)); err != nil {
			writeError(1, "DELETE_FAILED", err.Error())
		}

		writeJSON(map[string]interface{}{
			"deleted": true,
			"id":      sessionID,
		})
	},
}

// saveToHistory persists a search/ack interaction as a chat session of the
// given kind (chat.SessionKindAck or chat.SessionKindSearch(mode)).
// kbRoot is the knowledge base path used to associate the session with the KB.
// Repeated identical queries within a short window are merged into the existing
// session instead of creating duplicates.
// Failures are reported on stderr (never stdout, which is JSON-only) and do
// not affect the main command result.
func saveToHistory(kbRoot, kind, query string, result interface{}) {
	store, err := openChatStore()
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: history unavailable: %v\n", err)
		return
	}

	resultJSON, err := json.Marshal(result)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: history marshal failed: %v\n", err)
		return
	}

	if err := chat.RecordQuerySession(store, kbRoot, kind, query, string(resultJSON)); err != nil {
		fmt.Fprintf(os.Stderr, "warning: history record failed: %v\n", err)
	}
}

func init() {
	historyLsCmd.Flags().IntVar(&historyLimit, "limit", 10, "max results to return")

	historyCmd.AddCommand(historyLsCmd)
	historyCmd.AddCommand(historyShowCmd)
	historyCmd.AddCommand(historyDelCmd)
}
