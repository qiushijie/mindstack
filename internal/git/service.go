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

// Add stages specific files. If no files given, stages all changes.
func (s *Service) Add(files ...string) error {
	args := []string{"add"}
	if len(files) > 0 {
		args = append(args, files...)
	} else {
		args = append(args, "-A")
	}
	_, stderr, err := s.run(args...)
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

// ensureUpstream sets the current branch to track origin/<branch> if it has no upstream yet.
func (s *Service) ensureUpstream() error {
	branch, err := s.currentBranch()
	if err != nil {
		return err
	}
	_, _, err = s.run("rev-parse", "--abbrev-ref", "--symbolic-full-name", branch+"@{upstream}")
	if err == nil {
		return nil // already has upstream
	}
	// No upstream configured — set it
	_, stderr, err := s.run("branch", "--set-upstream-to", "origin/"+branch, branch)
	if err != nil {
		return fmt.Errorf("git branch --set-upstream-to: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

// Pull pulls from the upstream tracking branch.
// If no upstream is configured, it sets origin as upstream first.
func (s *Service) Pull() error {
	if err := s.ensureUpstream(); err != nil {
		return fmt.Errorf("git pull: %w", err)
	}
	_, stderr, err := s.run("pull", "--ff-only")
	if err != nil {
		return fmt.Errorf("git pull: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

// Push pushes to the remote tracking branch.
// If no upstream is configured, it pushes with -u to set it.
func (s *Service) Push() error {
	branch, err := s.currentBranch()
	if err != nil {
		return fmt.Errorf("git push: %w", err)
	}
	_, _, err = s.run("rev-parse", "--abbrev-ref", "--symbolic-full-name", branch+"@{upstream}")
	hasUpstream := err == nil

	var stderr string
	if hasUpstream {
		_, stderr, err = s.run("push")
	} else {
		_, stderr, err = s.run("push", "-u", "origin", branch)
	}
	if err != nil {
		return fmt.Errorf("git push: %w: %s", err, strings.TrimSpace(stderr))
	}
	return nil
}

func (s *Service) currentBranch() (string, error) {
	stdout, stderr, err := s.run("rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", fmt.Errorf("git rev-parse: %w: %s", err, strings.TrimSpace(stderr))
	}
	return strings.TrimSpace(stdout), nil
}

// Status returns a porcelain status string with individual untracked files.
func (s *Service) Status() (string, error) {
	stdout, stderr, err := s.run("status", "--porcelain", "--untracked-files=all")
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

// DiffFiles returns the diff for the specified files, checking staged changes first,
// then falling back to unstaged changes. Does NOT stage the files.
func (s *Service) DiffFiles(files ...string) (string, error) {
	args := append([]string{"diff", "--cached"}, files...)
	stdout, _, err := s.run(args...)
	if err != nil {
		return "", fmt.Errorf("git diff --cached: %w", err)
	}
	if stdout == "" {
		args := append([]string{"diff"}, files...)
		stdout, _, err = s.run(args...)
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

// GetRemote returns the remote URL for "origin", or empty string if not set.
func (s *Service) GetRemote() string {
	stdout, _, err := s.run("remote", "get-url", "origin")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(stdout)
}

// SetRemote adds or updates the remote "origin" with the given URL.
func (s *Service) SetRemote(url string) error {
	if s.HasRemote() {
		_, stderr, err := s.run("remote", "set-url", "origin", url)
		if err != nil {
			return fmt.Errorf("git remote set-url: %w: %s", err, strings.TrimSpace(stderr))
		}
	} else {
		_, stderr, err := s.run("remote", "add", "origin", url)
		if err != nil {
			return fmt.Errorf("git remote add: %w: %s", err, strings.TrimSpace(stderr))
		}
	}
	return nil
}
