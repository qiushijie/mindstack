package chat

import (
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newTestStore(t *testing.T) *Store {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	store := NewStore(db)
	if err := store.AutoMigrate(); err != nil {
		t.Fatalf("automigrate: %v", err)
	}
	return store
}

func TestNewStore(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	store := NewStore(db)
	if store == nil {
		t.Fatalf("expected non-nil store")
	}
	if store.db != db {
		t.Fatalf("expected store.db to be the same db instance")
	}
}

func TestAutoMigrate(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	store := NewStore(db)
	if err := store.AutoMigrate(); err != nil {
		t.Fatalf("automigrate failed: %v", err)
	}
}

func TestCreateSession(t *testing.T) {
	store := newTestStore(t)

	session, err := store.CreateSession("/workspace/a", "Test Session")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if session.ID == 0 {
		t.Fatalf("expected session ID to be set")
	}
	if session.WorkspacePath != "/workspace/a" {
		t.Fatalf("expected workspacePath /workspace/a, got %s", session.WorkspacePath)
	}
	if session.Title != "Test Session" {
		t.Fatalf("expected title 'Test Session', got %s", session.Title)
	}
}

func TestGetSession(t *testing.T) {
	store := newTestStore(t)

	created, err := store.CreateSession("/workspace/a", "Get Test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Success path
	session, err := store.GetSession(created.ID)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if session.ID != created.ID {
		t.Fatalf("expected ID %d, got %d", created.ID, session.ID)
	}
	if session.Title != "Get Test" {
		t.Fatalf("expected title 'Get Test', got %s", session.Title)
	}

	// Error path: not found
	_, err = store.GetSession(9999)
	if err == nil {
		t.Fatalf("expected error for non-existent session")
	}
}

func TestStore_ListSessions(t *testing.T) {
	store := newTestStore(t)

	// Empty list
	sessions, err := store.ListSessions("/workspace/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 0 {
		t.Fatalf("expected 0 sessions, got %d", len(sessions))
	}

	// Create sessions
	_, err = store.CreateSession("/workspace/a", "Session 1")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	time.Sleep(10 * time.Millisecond)
	_, err = store.CreateSession("/workspace/a", "Session 2")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	_, err = store.CreateSession("/workspace/b", "Other Session")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// List for workspace a
	sessions, err = store.ListSessions("/workspace/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}
	// Should be ordered by updated_at DESC, so Session 2 first
	if sessions[0].Title != "Session 2" {
		t.Fatalf("expected first session 'Session 2', got %s", sessions[0].Title)
	}
	if sessions[1].Title != "Session 1" {
		t.Fatalf("expected second session 'Session 1', got %s", sessions[1].Title)
	}
}

func TestStore_DeleteSession(t *testing.T) {
	store := newTestStore(t)

	created, err := store.CreateSession("/workspace/a", "To Delete")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Add a message
	_, err = store.AddMessage(created.ID, "user", "hello")
	if err != nil {
		t.Fatalf("add message: %v", err)
	}

	// Delete
	if err := store.DeleteSession(created.ID); err != nil {
		t.Fatalf("delete session: %v", err)
	}

	// Verify session deleted
	_, err = store.GetSession(created.ID)
	if err == nil {
		t.Fatalf("expected error after delete")
	}
}

func TestStore_UpdateSessionTitle(t *testing.T) {
	store := newTestStore(t)

	created, err := store.CreateSession("/workspace/a", "Old Title")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	if err := store.UpdateSessionTitle(created.ID, "New Title"); err != nil {
		t.Fatalf("update title: %v", err)
	}

	session, err := store.GetSession(created.ID)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if session.Title != "New Title" {
		t.Fatalf("expected title 'New Title', got %s", session.Title)
	}
}

func TestUpdateSessionTime(t *testing.T) {
	store := newTestStore(t)

	created, err := store.CreateSession("/workspace/a", "Time Test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	oldUpdatedAt := created.UpdatedAt
	time.Sleep(50 * time.Millisecond)

	if err := store.UpdateSessionTime(created.ID); err != nil {
		t.Fatalf("update time: %v", err)
	}

	session, err := store.GetSession(created.ID)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if !session.UpdatedAt.After(oldUpdatedAt) {
		t.Fatalf("expected updated_at to be after %v, got %v", oldUpdatedAt, session.UpdatedAt)
	}
}

func TestAddMessage(t *testing.T) {
	store := newTestStore(t)

	session, err := store.CreateSession("/workspace/a", "Message Test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	msg, err := store.AddMessage(session.ID, "user", "hello world")
	if err != nil {
		t.Fatalf("add message: %v", err)
	}
	if msg.ID == 0 {
		t.Fatalf("expected message ID to be set")
	}
	if msg.SessionID != session.ID {
		t.Fatalf("expected sessionID %d, got %d", session.ID, msg.SessionID)
	}
	if msg.Role != "user" {
		t.Fatalf("expected role 'user', got %s", msg.Role)
	}
	if msg.Content != "hello world" {
		t.Fatalf("expected content 'hello world', got %s", msg.Content)
	}

	// Note: SQLite in-memory without PRAGMA foreign_keys=ON does not enforce
	// foreign key constraints, so AddMessage with non-existent sessionID won't error.
	// The store layer does not enforce this either.
}

func TestGetMessages(t *testing.T) {
	store := newTestStore(t)

	session, err := store.CreateSession("/workspace/a", "Messages Test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Empty messages
	msgs, err := store.GetMessages(session.ID)
	if err != nil {
		t.Fatalf("get messages: %v", err)
	}
	if len(msgs) != 0 {
		t.Fatalf("expected 0 messages, got %d", len(msgs))
	}

	// Add messages
	_, err = store.AddMessage(session.ID, "user", "msg1")
	if err != nil {
		t.Fatalf("add message: %v", err)
	}
	time.Sleep(10 * time.Millisecond)
	_, err = store.AddMessage(session.ID, "assistant", "msg2")
	if err != nil {
		t.Fatalf("add message: %v", err)
	}

	msgs, err = store.GetMessages(session.ID)
	if err != nil {
		t.Fatalf("get messages: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Content != "msg1" {
		t.Fatalf("expected first message 'msg1', got %s", msgs[0].Content)
	}
	if msgs[1].Content != "msg2" {
		t.Fatalf("expected second message 'msg2', got %s", msgs[1].Content)
	}

	// Messages for non-existent session
	msgs, err = store.GetMessages(9999)
	if err != nil {
		t.Fatalf("get messages for non-existent session: %v", err)
	}
	if len(msgs) != 0 {
		t.Fatalf("expected 0 messages for non-existent session, got %d", len(msgs))
	}
}

func TestGetLatestSession(t *testing.T) {
	store := newTestStore(t)

	// No sessions
	latest, err := store.GetLatestSession("/workspace/a")
	if err != nil {
		t.Fatalf("get latest session: %v", err)
	}
	if latest != nil {
		t.Fatalf("expected nil for no sessions")
	}

	// Create sessions
	_, err = store.CreateSession("/workspace/a", "Session 1")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	time.Sleep(50 * time.Millisecond)
	s2, err := store.CreateSession("/workspace/a", "Session 2")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	_, err = store.CreateSession("/workspace/b", "Other Session")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Get latest for workspace a
	latest, err = store.GetLatestSession("/workspace/a")
	if err != nil {
		t.Fatalf("get latest session: %v", err)
	}
	if latest == nil {
		t.Fatalf("expected non-nil latest session")
	}
	if latest.ID != s2.ID {
		t.Fatalf("expected latest session ID %d, got %d", s2.ID, latest.ID)
	}
	if latest.Title != "Session 2" {
		t.Fatalf("expected title 'Session 2', got %s", latest.Title)
	}
}

func TestGetSessionPreloadsMessages(t *testing.T) {
	store := newTestStore(t)

	session, err := store.CreateSession("/workspace/a", "Preload Test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	_, err = store.AddMessage(session.ID, "user", "hello")
	if err != nil {
		t.Fatalf("add message: %v", err)
	}
	_, err = store.AddMessage(session.ID, "assistant", "hi")
	if err != nil {
		t.Fatalf("add message: %v", err)
	}

	fetched, err := store.GetSession(session.ID)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if len(fetched.Messages) != 2 {
		t.Fatalf("expected 2 preloaded messages, got %d", len(fetched.Messages))
	}
}

func TestAddMessageUpdatesSessionTime(t *testing.T) {
	store := newTestStore(t)

	session, err := store.CreateSession("/workspace/a", "Time Update Test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	oldUpdatedAt := session.UpdatedAt
	time.Sleep(50 * time.Millisecond)

	_, err = store.AddMessage(session.ID, "user", "trigger update")
	if err != nil {
		t.Fatalf("add message: %v", err)
	}

	updated, err := store.GetSession(session.ID)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	if !updated.UpdatedAt.After(oldUpdatedAt) {
		t.Fatalf("expected updated_at to be after %v after adding message, got %v", oldUpdatedAt, updated.UpdatedAt)
	}
}
