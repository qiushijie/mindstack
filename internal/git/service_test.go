package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func gitEnv() []string {
	return []string{
		"GIT_AUTHOR_NAME=Test",
		"GIT_AUTHOR_EMAIL=test@test.com",
		"GIT_COMMITTER_NAME=Test",
		"GIT_COMMITTER_EMAIL=test@test.com",
	}
}

func runGit(dir string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), gitEnv()...)
	return cmd.Run()
}

func runGitOutput(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), gitEnv()...)
	out, err := cmd.Output()
	return strings.TrimSpace(string(out)), err
}

func initRepo(t *testing.T, dir string) {
	t.Helper()
	if err := runGit(dir, "init"); err != nil {
		t.Fatal(err)
	}
}

func commitFile(t *testing.T, dir, name, content, msg string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
	if err := runGit(dir, "add", name); err != nil {
		t.Fatal(err)
	}
	if err := runGit(dir, "commit", "-m", msg); err != nil {
		t.Fatal(err)
	}
}

// ---------------------------------------------------------------------------
// CheckInit
// ---------------------------------------------------------------------------

func TestCheckInit(t *testing.T) {
	t.Parallel()

	t.Run("returns false when no .git directory", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		if s.CheckInit() {
			t.Error("expected false for non-git directory")
		}
	})

	t.Run("returns false when path does not exist", func(t *testing.T) {
		s := NewService("/nonexistent/path")
		if s.CheckInit() {
			t.Error("expected false for nonexistent path")
		}
	})

	t.Run("returns true after git init", func(t *testing.T) {
		dir := t.TempDir()
		initRepo(t, dir)
		s := NewService(dir)
		if !s.CheckInit() {
			t.Error("expected true after git init")
		}
	})
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

func TestInit(t *testing.T) {
	t.Parallel()

	t.Run("initializes without branch name", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		if err := s.Init(""); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !s.CheckInit() {
			t.Error("expected .git directory after init")
		}
	})

	t.Run("initializes with custom branch name", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		if err := s.Init("develop"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// First commit so branch resolves
			commitFile(t, dir, "init.md", "init", "initial")
			out, err := runGitOutput(dir, "rev-parse", "--abbrev-ref", "HEAD")
		if err != nil {
			t.Fatal(err)
		}
		if out != "develop" {
			t.Errorf("expected branch 'develop', got %q", out)
		}
	})

	t.Run("returns error when already initialized", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		if err := s.Init(""); err != nil {
			t.Fatal(err)
		}
		if err := s.Init(""); err == nil {
			t.Error("expected error when already initialized")
		}
	})

	t.Run("returns error with nonexistent path", func(t *testing.T) {
		s := NewService("/nonexistent/path")
		if err := s.Init(""); err == nil {
			t.Error("expected error for nonexistent path")
		}
	})
}

// ---------------------------------------------------------------------------
// AddAll
// ---------------------------------------------------------------------------

func TestAddAll(t *testing.T) {
	t.Parallel()

	t.Run("stages new file", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := os.WriteFile(filepath.Join(dir, "test.md"), []byte("hello"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := s.AddAll(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		status, _ := s.Status()
		if !strings.Contains(status, "test.md") {
			t.Errorf("expected test.md in status, got: %q", status)
		}
	})

	t.Run("stages modified file", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		commitFile(t, dir, "a.md", "v1", "initial")
		if err := os.WriteFile(filepath.Join(dir, "a.md"), []byte("v2"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := s.AddAll(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		status, _ := s.Status()
		if !strings.Contains(status, "a.md") {
			t.Errorf("expected a.md in status, got: %q", status)
		}
	})
}

// ---------------------------------------------------------------------------
// Commit
// ---------------------------------------------------------------------------

func TestCommit(t *testing.T) {
	t.Parallel()

	t.Run("commits staged changes", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := os.WriteFile(filepath.Join(dir, "hello.md"), []byte("world"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := s.AddAll(); err != nil {
			t.Fatal(err)
		}
		if err := s.Commit("feat: add hello"); err != nil {
			t.Errorf("unexpected error: %v", err)
		}
		log, _ := s.Log(1)
		if !strings.Contains(log, "feat: add hello") {
			t.Errorf("expected commit message in log, got: %q", log)
		}
	})

	t.Run("returns error on empty commit", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := s.Commit("should fail"); err == nil {
			t.Error("expected error on commit with no changes")
		}
	})
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

func TestStatus(t *testing.T) {
	t.Parallel()

	t.Run("returns empty for clean repo", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		status, err := s.Status()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if status != "" {
			t.Errorf("expected empty status, got: %q", status)
		}
	})

	t.Run("shows untracked file", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := os.WriteFile(filepath.Join(dir, "new.md"), []byte("test"), 0644); err != nil {
			t.Fatal(err)
		}
		status, _ := s.Status()
		if !strings.Contains(status, "new.md") {
			t.Errorf("expected new.md in status, got: %q", status)
		}
	})

	t.Run("returns error for nonexistent path", func(t *testing.T) {
		s := NewService("/nonexistent")
		_, err := s.Status()
		if err == nil {
			t.Error("expected error for nonexistent path")
		}
	})
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

func TestDiff(t *testing.T) {
	t.Parallel()

	t.Run("returns unstaged diff when no staged changes", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		commitFile(t, dir, "f.md", "content", "initial")
		if err := os.WriteFile(filepath.Join(dir, "f.md"), []byte("modified"), 0644); err != nil {
			t.Fatal(err)
		}
		diff, err := s.Diff()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(diff, "modified") {
			t.Errorf("expected diff to contain 'modified', got: %q", diff)
		}
	})

	t.Run("returns empty string for clean repo", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		diff, err := s.Diff()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if diff != "" {
			t.Errorf("expected empty diff for clean repo, got: %q", diff)
		}
	})
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

func TestLog(t *testing.T) {
	t.Parallel()

	t.Run("returns recent commits in order", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		commitFile(t, dir, "a.md", "a", "first")
		commitFile(t, dir, "b.md", "b", "second")
		log, err := s.Log(2)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(log, "first") || !strings.Contains(log, "second") {
			t.Errorf("expected both commits in log, got: %q", log)
		}
		lines := strings.Split(log, "\n")
		if len(lines) > 2 {
			t.Errorf("expected at most 2 entries, got %d", len(lines))
		}
	})

	t.Run("returns error when no commits yet", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		_, err := s.Log(1)
		if err == nil {
			t.Error("expected error when no commits exist")
		}
	})
}

// ---------------------------------------------------------------------------
// HasRemote
// ---------------------------------------------------------------------------

func TestHasRemote(t *testing.T) {
	t.Parallel()

	t.Run("returns false without remote", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if s.HasRemote() {
			t.Error("expected false when no remote configured")
		}
	})

	t.Run("returns true with remote configured", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if _, _, err := s.run("remote", "add", "origin", "https://example.com/repo.git"); err != nil {
			t.Fatal(err)
		}
		if !s.HasRemote() {
			t.Error("expected true when remote is configured")
		}
	})
}

// ---------------------------------------------------------------------------
// Integration: Push & Pull
// ---------------------------------------------------------------------------

func TestService_PushPull(t *testing.T) {
	remoteDir := t.TempDir()
	if err := runGit(remoteDir, "init", "--bare"); err != nil {
		t.Fatal(err)
	}

	localDir := t.TempDir()
	local := NewService(localDir)
	if err := local.Init("main"); err != nil {
		t.Fatal(err)
	}
	if _, _, err := local.run("remote", "add", "origin", remoteDir); err != nil {
		t.Fatal(err)
	}

	// Make initial commit so there is something to push
	commitFile(t, localDir, "initial.md", "init", "chore: initial")

	t.Run("push -u sets upstream and succeeds", func(t *testing.T) {
		_, stderr, err := local.run("push", "-u", "origin", "main")
		if err != nil {
			t.Fatalf("unexpected push error: %v: %s", err, strings.TrimSpace(stderr))
		}
		if !local.HasRemote() {
			t.Error("expected HasRemote to be true after adding remote")
		}
	})

	t.Run("push subsequent commits succeeds", func(t *testing.T) {
		commitFile(t, localDir, "second.md", "second", "feat: second")
		if err := local.Push(); err != nil {
			t.Errorf("unexpected push error: %v", err)
		}
	})

	t.Run("pull pulls remote changes", func(t *testing.T) {
		// Clone the remote into a second working directory, push a change,
		// then pull in the original local repo.
		cloneDir := t.TempDir()
		if err := runGit(cloneDir, "clone", remoteDir, cloneDir); err != nil {
			t.Fatal(err)
		}
		commitFile(t, cloneDir, "remote-change.md", "from clone", "feat: from clone")
		if err := runGit(cloneDir, "push"); err != nil {
			t.Fatal(err)
		}

		// Pull in the original local repo (tracking was set up by -u above)
		if err := local.Pull(); err != nil {
			t.Errorf("unexpected pull error: %v", err)
		}
		log, _ := local.Log(3)
		if !strings.Contains(log, "from clone") {
			t.Errorf("expected pulled commit in log, got: %q", log)
		}
	})

	t.Run("pull without remote returns error", func(t *testing.T) {
		noRemoteDir := t.TempDir()
		noRemote := NewService(noRemoteDir)
		initRepo(t, noRemoteDir)
		commitFile(t, noRemoteDir, "f.md", "x", "init")
		if err := noRemote.Pull(); err == nil {
			t.Error("expected error pulling without remote")
		}
	})

	t.Run("push without remote returns error", func(t *testing.T) {
		noRemoteDir := t.TempDir()
		noRemote := NewService(noRemoteDir)
		initRepo(t, noRemoteDir)
		commitFile(t, noRemoteDir, "f.md", "x", "init")
		if err := noRemote.Push(); err == nil {
			t.Error("expected error pushing without remote")
		}
	})
}

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

func TestService_EdgeCases(t *testing.T) {
	t.Parallel()

	t.Run("Diff returns staged changes when available", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := os.WriteFile(filepath.Join(dir, "f.md"), []byte("content"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := s.AddAll(); err != nil {
			t.Fatal(err)
		}
		diff, err := s.Diff()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if diff == "" {
			t.Error("expected non-empty diff for staged changes")
		}
	})

	t.Run("Log handles count larger than history", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		commitFile(t, dir, "f.md", "x", "only commit")
		log, err := s.Log(100)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(log, "only commit") {
			t.Errorf("expected log to contain commit, got: %q", log)
		}
	})

	t.Run("Status fails without .git directory", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		_, err := s.Status()
		if err == nil {
			t.Error("expected error for non-git directory")
		}
	})
}

// ---------------------------------------------------------------------------
// GetRemote
// ---------------------------------------------------------------------------

func TestGetRemote(t *testing.T) {
	t.Parallel()

	t.Run("returns empty string when no remote configured", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if got := s.GetRemote(); got != "" {
			t.Errorf("expected empty string, got %q", got)
		}
	})

	t.Run("returns remote URL when origin is set", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if _, _, err := s.run("remote", "add", "origin", "https://example.com/repo.git"); err != nil {
			t.Fatal(err)
		}
		if got := s.GetRemote(); got != "https://example.com/repo.git" {
			t.Errorf("expected %q, got %q", "https://example.com/repo.git", got)
		}
	})
}

// ---------------------------------------------------------------------------
// SetRemote
// ---------------------------------------------------------------------------

func TestSetRemote(t *testing.T) {
	t.Parallel()

	t.Run("adds new remote origin", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := s.SetRemote("https://example.com/repo.git"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got := s.GetRemote(); got != "https://example.com/repo.git" {
			t.Errorf("expected %q, got %q", "https://example.com/repo.git", got)
		}
	})

	t.Run("updates existing remote origin URL", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := s.SetRemote("https://example.com/old.git"); err != nil {
			t.Fatal(err)
		}
		if err := s.SetRemote("https://example.com/new.git"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got := s.GetRemote(); got != "https://example.com/new.git" {
			t.Errorf("expected %q, got %q", "https://example.com/new.git", got)
		}
	})

	t.Run("GetRemote returns correct URL after SetRemote", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		url := "https://github.com/user/repo.git"
		if err := s.SetRemote(url); err != nil {
			t.Fatal(err)
		}
		if got := s.GetRemote(); got != url {
			t.Errorf("expected %q, got %q", url, got)
		}
	})
}

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

func TestAdd(t *testing.T) {
	t.Parallel()

	t.Run("stages specified files but not others", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := os.WriteFile(filepath.Join(dir, "a.md"), []byte("a"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "b.md"), []byte("b"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := s.Add("a.md"); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		status, _ := s.Status()
		if !strings.Contains(status, "a.md") {
			t.Errorf("expected a.md in status, got: %q", status)
		}
		if !strings.Contains(status, "b.md") {
			t.Errorf("expected b.md to be in status (untracked), got: %q", status)
		if strings.Contains(status, "A  b.md") {
			t.Errorf("expected b.md not to be staged, got: %q", status)
		}
		}
	})

	t.Run("stages all changes when called without arguments", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		if err := os.WriteFile(filepath.Join(dir, "x.md"), []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "y.md"), []byte("y"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := s.Add(); err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		status, _ := s.Status()
		if !strings.Contains(status, "x.md") {
			t.Errorf("expected x.md in status, got: %q", status)
		}
		if !strings.Contains(status, "y.md") {
			t.Errorf("expected y.md in status, got: %q", status)
		}
	})

	t.Run("returns error in non-git directory", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		if err := s.Add("f.md"); err == nil {
			t.Error("expected error for non-git directory")
		}
	})
}

// ---------------------------------------------------------------------------
// DiffFiles
// ---------------------------------------------------------------------------

func TestDiffFiles(t *testing.T) {
	t.Parallel()

	t.Run("returns empty string for clean repo", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		commitFile(t, dir, "f.md", "content", "initial")
		diff, err := s.DiffFiles("f.md")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if diff != "" {
			t.Errorf("expected empty diff for clean repo, got: %q", diff)
		}
	})

	t.Run("returns unstaged diff for specified files", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		commitFile(t, dir, "f.md", "line1\nline2\n", "initial")
		if err := os.WriteFile(filepath.Join(dir, "f.md"), []byte("line1\nmodified\n"), 0644); err != nil {
			t.Fatal(err)
		}
		diff, err := s.DiffFiles("f.md")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(diff, "modified") {
			t.Errorf("expected diff to contain 'modified', got: %q", diff)
		}
	})

	t.Run("returns diff for all files when called without arguments", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		commitFile(t, dir, "a.md", "a content", "initial")
		commitFile(t, dir, "b.md", "b content", "second")
		if err := os.WriteFile(filepath.Join(dir, "a.md"), []byte("a changed"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "b.md"), []byte("b changed"), 0644); err != nil {
			t.Fatal(err)
		}
		diff, err := s.DiffFiles()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(diff, "a changed") {
			t.Errorf("expected diff to contain 'a changed', got: %q", diff)
		}
		if !strings.Contains(diff, "b changed") {
			t.Errorf("expected diff to contain 'b changed', got: %q", diff)
		}
	})

	t.Run("returns staged diff when changes are staged", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		initRepo(t, dir)
		commitFile(t, dir, "f.md", "original", "initial")
		if err := os.WriteFile(filepath.Join(dir, "f.md"), []byte("staged change"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := s.Add("f.md"); err != nil {
			t.Fatal(err)
		}
		diff, err := s.DiffFiles("f.md")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(diff, "staged change") {
			t.Errorf("expected diff to contain 'staged change', got: %q", diff)
		}
	})

	t.Run("returns error in non-git directory", func(t *testing.T) {
		dir := t.TempDir()
		s := NewService(dir)
		_, err := s.DiffFiles("f.md")
		if err == nil {
			t.Error("expected error for non-git directory")
		}
	})
}
