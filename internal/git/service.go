package git

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Service struct {
	rootPath string
}

func NewService(rootPath string) *Service {
	return &Service{rootPath: rootPath}
}

func (s *Service) run(args ...string) (string, string, error) {
	var stdout, stderr bytes.Buffer
	cmd := exec.Command("git", args...)
	cmd.Dir = s.rootPath
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

// CheckInit returns true if the workspace has a .git directory.
func (s *Service) CheckInit() bool {
	info, err := os.Stat(filepath.Join(s.rootPath, ".git"))
	return err == nil && info.IsDir()
}

// Init initializes a new git repository. Returns error if already initialized.
// branch specifies the initial branch name; if empty, the default name is used.
func (s *Service) Init(branch string) error {
	if s.CheckInit() {
		return fmt.Errorf("already a git repository")
	}
	var stderr string
	var err error
	if branch != "" {
		_, stderr, err = s.run("init", "--initial-branch", branch)
	} else {
		_, stderr, err = s.run("init")
	}
	if err != nil {
		return fmt.Errorf("git init: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

// AddAll stages all changes (new, modified, deleted).
func (s *Service) AddAll() error {
	_, stderr, err := s.run("add", "-A")
	if err != nil {
		return fmt.Errorf("git add: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

// Commit creates a commit with the given message.
func (s *Service) Commit(message string) error {
	_, stderr, err := s.run("commit", "-m", message)
	if err != nil {
		return fmt.Errorf("git commit: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

// Pull pulls from the remote tracking branch.
func (s *Service) Pull() error {
	_, stderr, err := s.run("pull", "--ff-only")
	if err != nil {
		return fmt.Errorf("git pull: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

// Push pushes to the remote tracking branch.
func (s *Service) Push() error {
	_, stderr, err := s.run("push")
	if err != nil {
		return fmt.Errorf("git push: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

// Status returns a porcelain status string.
func (s *Service) Status() (string, error) {
	stdout, stderr, err := s.run("status", "--porcelain")
	if err != nil {
		return "", fmt.Errorf("git status: %w: %s", err, strings.TrimSpace(stderr))
	}
	return strings.TrimSpace(stdout), nil
}

// Diff returns the diff of staged changes (--cached).
// If no staged changes, falls back to unstaged diff.
func (s *Service) Diff() (string, error) {
	stdout, _, err := s.run("diff", "--cached")
	if err != nil {
		return "", fmt.Errorf("git diff --cached: %w", err)
	}
	if stdout == "" {
		stdout, _, err = s.run("diff")
		if err != nil {
			return "", fmt.Errorf("git diff: %w", err)
		}
	}
	return stdout, nil
}

// Log returns recent commit messages for context (used for LLM prompt).
func (s *Service) Log(count int) (string, error) {
	stdout, stderr, err := s.run("log", fmt.Sprintf("-%d", count), "--oneline")
	if err != nil {
		return "", fmt.Errorf("git log: %w: %s", err, strings.TrimSpace(stderr))
	}
	return strings.TrimSpace(stdout), nil
}

// HasRemote returns true if a remote is configured.
func (s *Service) HasRemote() bool {
	stdout, _, err := s.run("remote", "-v")
	return err == nil && strings.TrimSpace(stdout) != ""
}
