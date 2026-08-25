package chat

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

// Session kinds recorded in ChatSession.Kind. Query history sessions are
// namespaced by source so identical queries from different sources never
// merge into one another.
const (
	// SessionKindChat is a regular interactive chat session.
	SessionKindChat = "chat"
	// SessionKindAck is a session recorded by the ack command.
	SessionKindAck = "ack"
)

// SessionKindSearch returns the session kind for a search query with the
// given retrieval mode (tag, fulltext, or hybrid).
func SessionKindSearch(mode string) string {
	return "search:" + mode
}

// ChatSession represents a conversation session tied to a workspace.
type ChatSession struct {
	ID            uint          `gorm:"primaryKey" json:"id"`
	CreatedAt     time.Time     `json:"createdAt"`
	UpdatedAt     time.Time     `json:"updatedAt"`
	WorkspacePath string        `gorm:"index;not null" json:"workspacePath"`
	Title         string        `json:"title"`
	Kind          string        `gorm:"index" json:"kind"`
	Messages      []ChatMessage `gorm:"foreignKey:SessionID;constraint:OnDelete:CASCADE" json:"messages"`
}

// ChatMessage represents a single message in a session.
type ChatMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	SessionID uint      `gorm:"index;not null" json:"sessionId"`
	Role      string    `gorm:"not null" json:"role"`
	Content   string    `gorm:"type:text;not null" json:"content"`
}

// Store provides database operations for chat sessions.
type Store struct {
	db *gorm.DB
}

func NewStore(db *gorm.DB) *Store {
	return &Store{db: db}
}

func (s *Store) AutoMigrate() error {
	return s.db.AutoMigrate(&ChatSession{}, &ChatMessage{})
}

// CreateSession creates a regular interactive chat session (kind "chat").
func (s *Store) CreateSession(workspacePath, title string) (*ChatSession, error) {
	return s.CreateSessionWithKind(workspacePath, title, SessionKindChat)
}

// CreateSessionWithKind creates a session of the given kind.
func (s *Store) CreateSessionWithKind(workspacePath, title, kind string) (*ChatSession, error) {
	session := &ChatSession{
		WorkspacePath: workspacePath,
		Title:         title,
		Kind:          kind,
	}
	if err := s.db.Create(session).Error; err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	return session, nil
}

func (s *Store) GetSession(id uint) (*ChatSession, error) {
	var session ChatSession
	if err := s.db.Preload("Messages").First(&session, id).Error; err != nil {
		return nil, fmt.Errorf("get session: %w", err)
	}
	return &session, nil
}

func (s *Store) ListSessions(workspacePath string) ([]ChatSession, error) {
	var sessions []ChatSession
	if err := s.db.Where("workspace_path = ?", workspacePath).Order("updated_at DESC").Find(&sessions).Error; err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	return sessions, nil
}

func (s *Store) DeleteSession(id uint) error {
	if err := s.db.Delete(&ChatSession{}, id).Error; err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

func (s *Store) UpdateSessionTitle(id uint, title string) error {
	if err := s.db.Model(&ChatSession{}).Where("id = ?", id).Update("title", title).Error; err != nil {
		return fmt.Errorf("update title: %w", err)
	}
	return nil
}

func (s *Store) UpdateSessionTime(id uint) error {
	if err := s.db.Model(&ChatSession{}).Where("id = ?", id).Update("updated_at", time.Now()).Error; err != nil {
		return fmt.Errorf("update time: %w", err)
	}
	return nil
}

func (s *Store) AddMessage(sessionID uint, role, content string) (*ChatMessage, error) {
	msg := &ChatMessage{
		SessionID: sessionID,
		Role:      role,
		Content:   content,
	}
	if err := s.db.Create(msg).Error; err != nil {
		return nil, fmt.Errorf("add message: %w", err)
	}
	// Update session updated_at
	_ = s.UpdateSessionTime(sessionID)
	return msg, nil
}

// ReplaceLastAssistantMessage updates the content of the most recent assistant
// message in the given session. If the session has no assistant message yet,
// a new one is appended.
func (s *Store) ReplaceLastAssistantMessage(sessionID uint, content string) error {
	// Use Find instead of First so a missing row does not trigger gorm's
	// "record not found" log. The root cause is fixed in internal/db, which
	// configures gorm's logger with IgnoreRecordNotFoundError and stderr
	// output; Find is kept here so stores built with a default gorm config
	// (e.g. in tests) stay quiet as well.
	var matches []ChatMessage
	if err := s.db.Where("session_id = ? AND role = ?", sessionID, "assistant").
		Order("created_at DESC, id DESC").Limit(1).Find(&matches).Error; err != nil {
		return fmt.Errorf("find last assistant message: %w", err)
	}
	if len(matches) == 0 {
		_, err := s.AddMessage(sessionID, "assistant", content)
		return err
	}
	if err := s.db.Model(&matches[0]).Update("content", content).Error; err != nil {
		return fmt.Errorf("update assistant message: %w", err)
	}
	_ = s.UpdateSessionTime(sessionID)
	return nil
}

func (s *Store) GetMessages(sessionID uint) ([]ChatMessage, error) {
	var messages []ChatMessage
	if err := s.db.Where("session_id = ?", sessionID).Order("created_at ASC").Find(&messages).Error; err != nil {
		return nil, fmt.Errorf("get messages: %w", err)
	}
	return messages, nil
}

func (s *Store) CountMessages(sessionID uint) (int64, error) {
	var count int64
	if err := s.db.Model(&ChatMessage{}).Where("session_id = ?", sessionID).Count(&count).Error; err != nil {
		return 0, fmt.Errorf("count messages: %w", err)
	}
	return count, nil
}

func (s *Store) ListRecentSessions(workspacePath string, limit int) ([]ChatSession, error) {
	var sessions []ChatSession
	if err := s.db.Where("workspace_path = ?", workspacePath).
		Order("updated_at DESC").Limit(limit).
		Find(&sessions).Error; err != nil {
		return nil, fmt.Errorf("list recent sessions: %w", err)
	}
	return sessions, nil
}

func (s *Store) GetLatestSession(workspacePath string) (*ChatSession, error) {
	var session ChatSession
	if err := s.db.Where("workspace_path = ?", workspacePath).Order("updated_at DESC").First(&session).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, fmt.Errorf("get latest session: %w", err)
	}
	return &session, nil
}
