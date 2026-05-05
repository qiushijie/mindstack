package watcher

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// waitForCallback waits for a path to arrive on the channel within timeout.
// Returns the path or empty string on timeout.
func waitForCallback(ch <-chan string, timeout time.Duration) string {
	select {
	case p := <-ch:
		return p
	case <-time.After(timeout):
		return ""
	}
}

// drainCallbacks reads all callbacks until quiet for the given duration.
func drainCallbacks(ch <-chan string, quietFor time.Duration) []string {
	var got []string
	timer := time.NewTimer(quietFor)
	defer timer.Stop()
	for {
		select {
		case p := <-ch:
			got = append(got, p)
			if !timer.Stop() {
				<-timer.C
			}
			timer.Reset(quietFor)
		case <-timer.C:
			return got
		}
	}
}

// newTestWatcher creates a Watcher whose callback pushes paths into ch.
func newTestWatcher(ch chan<- string) *Watcher {
	return New(func(path string) {
		ch <- path
	})
}

// startWatcher starts a watcher and registers cleanup.
func startWatcher(t *testing.T, w *Watcher, root string) {
	t.Helper()
	if err := w.Start(root); err != nil {
		t.Fatalf("watcher start: %v", err)
	}
	t.Cleanup(func() {
		w.Stop()
	})
	// Give fsnotify a moment to register watches before tests fire events.
	time.Sleep(100 * time.Millisecond)
}

// --- TestIsMdFile ---

func TestIsMdFile(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want bool
	}{
		{"lowercase md", "foo.md", true},
		{"uppercase MD", "foo.MD", true},
		{"mixed case Md", "foo.Md", true},
		{"mixed case mD", "foo.mD", true},
		{"with path", "/tmp/dir/note.md", true},
		{"markdown extension not supported", "foo.markdown", false},
		{"txt file", "foo.txt", false},
		{"json file", "foo.json", false},
		{"empty string", "", false},
		{"no extension", "README", false},
		{"only md without dot", "md", false},
		{"md inside name not at end", "md.txt", false},
		{"trailing dot only", "foo.", false},
		{"dot md exactly", ".md", true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := isMdFile(c.in)
			if got != c.want {
				t.Fatalf("isMdFile(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

// --- TestNew ---

func TestNew(t *testing.T) {
	w := New(func(string) {})
	if w == nil {
		t.Fatal("New returned nil")
	}
	if w.callback == nil {
		t.Fatal("expected callback to be set")
	}
	if w.done == nil {
		t.Fatal("expected done channel to be initialized")
	}
	if w.running {
		t.Fatal("expected running=false on a newly constructed watcher")
	}
	if w.watcher != nil {
		t.Fatal("expected fsnotify watcher to be nil before Start")
	}
}

func TestNew_NilCallback(t *testing.T) {
	w := New(nil)
	if w == nil {
		t.Fatal("New(nil) returned nil")
	}
	if w.callback != nil {
		t.Fatal("expected nil callback")
	}
}

// --- Event triggering tests ---

func TestWatcher_WriteEventTriggersCallback(t *testing.T) {
	dir := t.TempDir()
	mdPath := filepath.Join(dir, "note.md")
	if err := os.WriteFile(mdPath, []byte("initial"), 0644); err != nil {
		t.Fatalf("write initial: %v", err)
	}

	ch := make(chan string, 16)
	w := newTestWatcher(ch)
	startWatcher(t, w, dir)

	// Modify the file to trigger a Write event.
	if err := os.WriteFile(mdPath, []byte("updated"), 0644); err != nil {
		t.Fatalf("write update: %v", err)
	}

	got := waitForCallback(ch, 2*time.Second)
	if got == "" {
		t.Fatal("expected callback for write event, got timeout")
	}
	if filepath.Base(got) != "note.md" {
		t.Fatalf("expected callback for note.md, got %s", got)
	}
}

func TestWatcher_NonMdFileFiltered(t *testing.T) {
	dir := t.TempDir()
	ch := make(chan string, 16)
	w := newTestWatcher(ch)
	startWatcher(t, w, dir)

	txtPath := filepath.Join(dir, "note.txt")
	if err := os.WriteFile(txtPath, []byte("hello"), 0644); err != nil {
		t.Fatalf("write txt: %v", err)
	}

	got := waitForCallback(ch, 500*time.Millisecond)
	if got != "" {
		t.Fatalf("expected no callback for .txt file, got %s", got)
	}
}

func TestWatcher_HiddenFileFiltered(t *testing.T) {
	dir := t.TempDir()
	ch := make(chan string, 16)
	w := newTestWatcher(ch)
	startWatcher(t, w, dir)

	hiddenPath := filepath.Join(dir, ".hidden.md")
	if err := os.WriteFile(hiddenPath, []byte("hidden"), 0644); err != nil {
		t.Fatalf("write hidden: %v", err)
	}

	got := waitForCallback(ch, 500*time.Millisecond)
	if got != "" {
		t.Fatalf("expected no callback for hidden .md file, got %s", got)
	}
}

func TestWatcher_RemoveEventTriggers(t *testing.T) {
	dir := t.TempDir()
	mdPath := filepath.Join(dir, "doomed.md")
	if err := os.WriteFile(mdPath, []byte("bye"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	ch := make(chan string, 16)
	w := newTestWatcher(ch)
	startWatcher(t, w, dir)

	if err := os.Remove(mdPath); err != nil {
		t.Fatalf("remove: %v", err)
	}

	deadline := time.After(2 * time.Second)
	for {
		select {
		case got := <-ch:
			if filepath.Base(got) == "doomed.md" {
				return
			}
		case <-deadline:
			t.Fatal("expected callback for remove event of doomed.md")
		}
	}
}

func TestWatcher_CreateEventTriggers(t *testing.T) {
	dir := t.TempDir()
	ch := make(chan string, 16)
	w := newTestWatcher(ch)
	startWatcher(t, w, dir)

	mdPath := filepath.Join(dir, "fresh.md")
	if err := os.WriteFile(mdPath, []byte("new"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	deadline := time.After(2 * time.Second)
	for {
		select {
		case got := <-ch:
			if filepath.Base(got) == "fresh.md" {
				return
			}
		case <-deadline:
			t.Fatal("expected callback for create event of fresh.md")
		}
	}
}

func TestWatcher_RenameEventTriggers(t *testing.T) {
	dir := t.TempDir()
	oldPath := filepath.Join(dir, "old.md")
	if err := os.WriteFile(oldPath, []byte("rename me"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	ch := make(chan string, 16)
	w := newTestWatcher(ch)
	startWatcher(t, w, dir)

	newPath := filepath.Join(dir, "new.md")
	if err := os.Rename(oldPath, newPath); err != nil {
		t.Fatalf("rename: %v", err)
	}

	// Either old (rename event) or new (create event) is fine — both are .md
	// and both should trigger a callback.
	got := waitForCallback(ch, 2*time.Second)
	if got == "" {
		t.Fatal("expected callback for rename event")
	}
	base := filepath.Base(got)
	if base != "old.md" && base != "new.md" {
		t.Fatalf("expected callback for old.md or new.md, got %s", got)
	}
}

func TestWatcher_RecursiveSubdirAddedAfterStart(t *testing.T) {
	dir := t.TempDir()
	ch := make(chan string, 16)
	w := newTestWatcher(ch)
	startWatcher(t, w, dir)

	// Create a new subdirectory after Start.
	subdir := filepath.Join(dir, "sub")
	if err := os.Mkdir(subdir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	// Give fsnotify time to pick up the new directory and add it to the watch list.
	time.Sleep(300 * time.Millisecond)

	mdPath := filepath.Join(subdir, "child.md")
	if err := os.WriteFile(mdPath, []byte("nested"), 0644); err != nil {
		t.Fatalf("write nested md: %v", err)
	}

	deadline := time.After(2 * time.Second)
	for {
		select {
		case got := <-ch:
			if filepath.Base(got) == "child.md" {
				return
			}
		case <-deadline:
			t.Fatal("expected callback for child.md in newly created subdirectory")
		}
	}
}

func TestWatcher_HiddenDirSkipped(t *testing.T) {
	dir := t.TempDir()
	gitDir := filepath.Join(dir, ".git")
	if err := os.Mkdir(gitDir, 0755); err != nil {
		t.Fatalf("mkdir .git: %v", err)
	}

	ch := make(chan string, 16)
	w := newTestWatcher(ch)
	startWatcher(t, w, dir)

	mdPath := filepath.Join(gitDir, "inside.md")
	if err := os.WriteFile(mdPath, []byte("should be ignored"), 0644); err != nil {
		t.Fatalf("write inside .git: %v", err)
	}

	got := waitForCallback(ch, 500*time.Millisecond)
	if got != "" {
		t.Fatalf("expected no callback for files inside .git, got %s", got)
	}
}

// --- Stop tests ---

func TestWatcher_Stop_Synchronous(t *testing.T) {
	dir := t.TempDir()
	w := New(func(string) {})
	if err := w.Start(dir); err != nil {
		t.Fatalf("start: %v", err)
	}

	// Sanity check: watcher field is set after Start.
	w.mu.Lock()
	wasSet := w.watcher != nil
	w.mu.Unlock()
	if !wasSet {
		t.Fatal("expected fsnotify watcher to be set after Start")
	}

	w.Stop()

	// After Stop returns, eventLoop must have exited and released the
	// fsnotify watcher (set to nil in its defer).
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.watcher != nil {
		t.Fatal("expected fsnotify watcher to be nil after Stop")
	}
	if w.running {
		t.Fatal("expected running=false after Stop")
	}
}

func TestWatcher_Stop_BeforeStart(t *testing.T) {
	w := New(func(string) {})
	// Should not panic and should be a no-op.
	w.Stop()
}

func TestWatcher_Stop_Idempotent(t *testing.T) {
	dir := t.TempDir()
	w := New(func(string) {})
	if err := w.Start(dir); err != nil {
		t.Fatalf("start: %v", err)
	}
	w.Stop()
	// Second Stop should not panic or block.
	w.Stop()
}

// TestWatcher_StartStopRestart verifies the watcher can be started, stopped,
// and started again without leaks or hangs, and that the second incarnation
// still delivers events. This regresses the wg synchronization fix.
func TestWatcher_StartStopRestart(t *testing.T) {
	dir := t.TempDir()

	var counter atomic.Int32
	ch := make(chan string, 16)
	w := New(func(p string) {
		counter.Add(1)
		ch <- p
	})

	// First lifecycle.
	if err := w.Start(dir); err != nil {
		t.Fatalf("first start: %v", err)
	}
	w.Stop()

	// Drain any straggling events from the first run.
	drainCallbacks(ch, 100*time.Millisecond)

	// Second lifecycle.
	if err := w.Start(dir); err != nil {
		t.Fatalf("second start: %v", err)
	}
	t.Cleanup(func() { w.Stop() })

	// Allow watches to be registered.
	time.Sleep(100 * time.Millisecond)

	mdPath := filepath.Join(dir, "second-round.md")
	if err := os.WriteFile(mdPath, []byte("hello again"), 0644); err != nil {
		t.Fatalf("write: %v", err)
	}

	deadline := time.After(2 * time.Second)
	for {
		select {
		case got := <-ch:
			if filepath.Base(got) == "second-round.md" {
				return
			}
		case <-deadline:
			t.Fatalf("expected callback for second-round.md after restart, got %d total callbacks", counter.Load())
		}
	}
}

// TestWatcher_AddRecursiveFailure_NoLeak verifies that when Start fails the
// watcher state is cleaned up: running is reset to false and the fsnotify
// watcher field is nil. We force a failure by exhausting the watch slot via a
// path that fsnotify.Add cannot accept — a Unix domain socket file inside a
// directory does not trigger this, so we instead emulate the failure path by
// directly calling the cleanup branch logic: pass a path that fails to walk by
// removing read permissions on a subdirectory, which causes filepath.Walk to
// invoke the visit fn with a non-nil err. The current implementation swallows
// such errors, so this test instead documents the success-path invariant by
// verifying the cleanup code in Start is reachable via Stop.
//
// We can't force addRecursive to return non-nil via the public API on the
// current implementation (filepath.Walk errors are swallowed by the walkFunc),
// so instead we verify the symmetric invariant: starting on a nonexistent
// path does NOT leak resources — Start either succeeds with an empty watch
// list or returns an error, but never leaves the watcher in an inconsistent
// state.
func TestWatcher_AddRecursiveFailure_NoLeak(t *testing.T) {
	dir := t.TempDir()
	bogus := filepath.Join(dir, "does-not-exist")

	w := New(func(string) {})
	err := w.Start(bogus)

	if err != nil {
		// Expected failure path: state must be clean.
		w.mu.Lock()
		defer w.mu.Unlock()
		if w.running {
			t.Fatal("expected running=false after Start failure")
		}
		if w.watcher != nil {
			t.Fatal("expected fsnotify watcher to be nil after Start failure")
		}
		return
	}

	// Success path: the implementation tolerates a missing directory because
	// filepath.Walk surfaces stat errors via the walkFunc which swallows them.
	// In that case the watcher is running with an empty watch list. Verify
	// state consistency and clean shutdown.
	w.mu.Lock()
	running := w.running
	hasWatcher := w.watcher != nil
	w.mu.Unlock()
	if !running {
		t.Fatal("Start returned nil but running=false")
	}
	if !hasWatcher {
		t.Fatal("Start returned nil but watcher is nil")
	}

	w.Stop()

	w.mu.Lock()
	defer w.mu.Unlock()
	if w.running {
		t.Fatal("expected running=false after Stop")
	}
	if w.watcher != nil {
		t.Fatal("expected fsnotify watcher to be nil after Stop")
	}
}
