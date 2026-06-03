package main

import (
	"encoding/json"
	"fmt"
	"strconv"

	"mindstack/internal/chat"
	"mindstack/internal/db"

	"github.com/spf13/cobra"
)

var historyLimit int

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

		d, err := db.Init()
		if err != nil {
			writeError(1, "DB_INIT_FAILED", err.Error())
		}
		store := chat.NewStore(d)

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

		d, err := db.Init()
		if err != nil {
			writeError(1, "DB_INIT_FAILED", err.Error())
		}
		store := chat.NewStore(d)

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

		d, err := db.Init()
		if err != nil {
			writeError(1, "DB_INIT_FAILED", err.Error())
		}
		store := chat.NewStore(d)

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

// saveToHistory persists a search/ack interaction as a chat session.
// kbRoot is the knowledge base path used to associate the session with the KB.
// Errors are silently ignored to not affect the main command result.
func saveToHistory(kbRoot, query string, result interface{}) {
	d, err := db.Init()
	if err != nil {
		return
	}
	store := chat.NewStore(d)

	resultJSON, err := json.Marshal(result)
	if err != nil {
		return
	}

	title := query
	if len(title) > 50 {
		title = title[:50] + "..."
	}

	session, err := store.CreateSession(kbRoot, title)
	if err != nil {
		return
	}
	if _, err := store.AddMessage(session.ID, "user", query); err != nil {
		return
	}
	if _, err := store.AddMessage(session.ID, "assistant", string(resultJSON)); err != nil {
		return
	}
}

func init() {
	historyLsCmd.Flags().IntVar(&historyLimit, "limit", 10, "max results to return")

	historyCmd.AddCommand(historyLsCmd)
	historyCmd.AddCommand(historyShowCmd)
	historyCmd.AddCommand(historyDelCmd)
}
