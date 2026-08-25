package chat

import (
	"strings"
	"testing"
	"time"
)

func TestRecordQuerySession_CreatesNewSession(t *testing.T) {
	store := newTestStore(t)

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "hello query", `{"hits":1}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	sessions, err := store.ListSessions("/kb/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].Title != "hello query" {
		t.Fatalf("expected title 'hello query', got %s", sessions[0].Title)
	}
	if sessions[0].Kind != SessionKindSearch("tag") {
		t.Fatalf("expected kind %q, got %q", SessionKindSearch("tag"), sessions[0].Kind)
	}

	msgs, err := store.GetMessages(sessions[0].ID)
	if err != nil {
		t.Fatalf("get messages: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Role != "user" || msgs[0].Content != "hello query" {
		t.Fatalf("unexpected user message: %+v", msgs[0])
	}
	if msgs[1].Role != "assistant" || msgs[1].Content != `{"hits":1}` {
		t.Fatalf("unexpected assistant message: %+v", msgs[1])
	}
}

func TestRecordQuerySession_MergesWithinWindow(t *testing.T) {
	store := newTestStore(t)

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "same query", `{"hits":1}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}
	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "same query", `{"hits":2}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	sessions, err := store.ListSessions("/kb/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session after merge, got %d", len(sessions))
	}

	msgs, err := store.GetMessages(sessions[0].ID)
	if err != nil {
		t.Fatalf("get messages: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages after merge, got %d", len(msgs))
	}
	if msgs[1].Content != `{"hits":2}` {
		t.Fatalf("expected assistant content updated to latest result, got %s", msgs[1].Content)
	}
}

func TestRecordQuerySession_DifferentKindDoesNotMerge(t *testing.T) {
	store := newTestStore(t)

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "same query", `{"hits":1}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}
	if err := RecordQuerySession(store, "/kb/a", SessionKindAck, "same query", `{"hits":2}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}
	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("hybrid"), "same query", `{"hits":3}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	sessions, err := store.ListSessions("/kb/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 3 {
		t.Fatalf("expected 3 sessions for different kinds, got %d", len(sessions))
	}
}

func TestRecordQuerySession_PrefixCollisionCreatesNewSession(t *testing.T) {
	store := newTestStore(t)

	// Two queries sharing a 60-rune prefix (longer than the 50-rune title
	// truncation) but differing afterwards must not merge.
	prefix := strings.Repeat("a", 60)
	query1 := prefix + "-first"
	query2 := prefix + "-second"

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), query1, `{"hits":1}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}
	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), query2, `{"hits":2}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	sessions, err := store.ListSessions("/kb/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions for prefix-colliding queries, got %d", len(sessions))
	}
}

func TestRecordQuerySession_NewSessionAfterWindow(t *testing.T) {
	store := newTestStore(t)

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "same query", `{"hits":1}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	// Age the existing session beyond the dedup window.
	if err := store.db.Model(&ChatSession{}).Where("workspace_path = ?", "/kb/a").
		Update("created_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatalf("age session: %v", err)
	}

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "same query", `{"hits":2}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	sessions, err := store.ListSessions("/kb/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions after window expired, got %d", len(sessions))
	}
}

func TestRecordQuerySession_DifferentQueryCreatesNewSession(t *testing.T) {
	store := newTestStore(t)

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "query one", `{"hits":1}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}
	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "query two", `{"hits":2}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	sessions, err := store.ListSessions("/kb/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions for different queries, got %d", len(sessions))
	}
}

func TestRecordQuerySession_DifferentWorkspaceCreatesNewSession(t *testing.T) {
	store := newTestStore(t)

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), "same query", `{"hits":1}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}
	if err := RecordQuerySession(store, "/kb/b", SessionKindSearch("tag"), "same query", `{"hits":2}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	aSessions, err := store.ListSessions("/kb/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	bSessions, err := store.ListSessions("/kb/b")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(aSessions) != 1 || len(bSessions) != 1 {
		t.Fatalf("expected 1 session per workspace, got a=%d b=%d", len(aSessions), len(bSessions))
	}
}

func TestRecordQuerySession_TruncatesLongTitle(t *testing.T) {
	store := newTestStore(t)

	long := make([]rune, 60)
	for i := range long {
		long[i] = '中'
	}
	query := string(long)

	if err := RecordQuerySession(store, "/kb/a", SessionKindSearch("tag"), query, `{}`); err != nil {
		t.Fatalf("record query session: %v", err)
	}

	sessions, err := store.ListSessions("/kb/a")
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	want := string(long[:50]) + "..."
	if sessions[0].Title != want {
		t.Fatalf("expected truncated title %q, got %q", want, sessions[0].Title)
	}
}

func TestStore_ReplaceLastAssistantMessage(t *testing.T) {
	store := newTestStore(t)

	session, err := store.CreateSession("/kb/a", "Replace Test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// No assistant message yet: appends a new one.
	if err := store.ReplaceLastAssistantMessage(session.ID, "first"); err != nil {
		t.Fatalf("replace last assistant message: %v", err)
	}
	msgs, err := store.GetMessages(session.ID)
	if err != nil {
		t.Fatalf("get messages: %v", err)
	}
	if len(msgs) != 1 || msgs[0].Role != "assistant" || msgs[0].Content != "first" {
		t.Fatalf("expected appended assistant message, got %+v", msgs)
	}

	// Existing assistant message: updates the latest one in place.
	time.Sleep(10 * time.Millisecond)
	if _, err := store.AddMessage(session.ID, "assistant", "second"); err != nil {
		t.Fatalf("add message: %v", err)
	}
	if err := store.ReplaceLastAssistantMessage(session.ID, "updated"); err != nil {
		t.Fatalf("replace last assistant message: %v", err)
	}
	msgs, err = store.GetMessages(session.ID)
	if err != nil {
		t.Fatalf("get messages: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Content != "first" {
		t.Fatalf("expected first message unchanged, got %s", msgs[0].Content)
	}
	if msgs[1].Content != "updated" {
		t.Fatalf("expected last assistant message updated, got %s", msgs[1].Content)
	}
}
