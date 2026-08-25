package chat

import (
	"fmt"
	"time"
)

// queryDedupWindow is the time window within which repeated identical queries
// are merged into the existing history session instead of creating a new one.
// The window is anchored at the candidate session's created_at and is fixed:
// merging a repeated query does not extend the window, so a session stops
// absorbing duplicates queryDedupWindow after it was first created. This is
// intentional (fixed-window semantics); switch to a sliding window if
// debounce-like behavior is ever needed.
const queryDedupWindow = 30 * time.Second

// RecordQuerySession persists a search/ack query interaction as a chat session
// of the given kind (e.g. SessionKindAck or SessionKindSearch(mode)). If a
// session of the same kind with the same full query already exists under
// kbRoot within the last queryDedupWindow, its last assistant message is
// updated with the new result instead of creating a duplicate session.
// Otherwise a new session is created with a user message (the query) and an
// assistant message (the result JSON).
//
// Dedup compares the full query text against the candidate session's first
// user message; the session title is a truncated, display-only copy and is
// never used for equality.
func RecordQuerySession(store *Store, kbRoot, kind, query, resultJSON string) error {
	title := truncateTitle(query)

	// The title narrows candidates cheaply (title is a deterministic
	// truncation of the query), then the full first user message decides
	// equality, so two different queries sharing only a long common prefix
	// do not merge.
	var matches []ChatSession
	err := store.db.Where("workspace_path = ? AND kind = ? AND title = ? AND created_at >= ?",
		kbRoot, kind, title, time.Now().Add(-queryDedupWindow)).
		Order("created_at DESC, id DESC").Find(&matches).Error
	if err != nil {
		return fmt.Errorf("find recent query session: %w", err)
	}
	for _, candidate := range matches {
		same, err := firstUserMessageEquals(store, candidate.ID, query)
		if err != nil {
			return err
		}
		if same {
			return store.ReplaceLastAssistantMessage(candidate.ID, resultJSON)
		}
	}

	session, err := store.CreateSessionWithKind(kbRoot, title, kind)
	if err != nil {
		return err
	}
	if _, err := store.AddMessage(session.ID, "user", query); err != nil {
		return err
	}
	if _, err := store.AddMessage(session.ID, "assistant", resultJSON); err != nil {
		return err
	}
	return nil
}

// firstUserMessageEquals reports whether the first user message of the given
// session matches query exactly.
func firstUserMessageEquals(store *Store, sessionID uint, query string) (bool, error) {
	// Find instead of First: see ReplaceLastAssistantMessage for why (the
	// gorm logger root-cause fix lives in internal/db).
	var msgs []ChatMessage
	if err := store.db.Where("session_id = ? AND role = ?", sessionID, "user").
		Order("created_at ASC, id ASC").Limit(1).Find(&msgs).Error; err != nil {
		return false, fmt.Errorf("find first user message: %w", err)
	}
	return len(msgs) > 0 && msgs[0].Content == query, nil
}
