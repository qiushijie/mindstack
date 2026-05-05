package watcher

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/fsnotify/fsnotify"
)

type Callback func(path string)

type Watcher struct {
	watcher  *fsnotify.Watcher
	done     chan struct{}
	mu       sync.Mutex
	running  bool
	callback Callback
	wg       sync.WaitGroup
}

func New(cb Callback) *Watcher {
	return &Watcher{
		done:     make(chan struct{}),
		callback: cb,
	}
}

func (w *Watcher) Start(root string) error {
	fw, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("fsnotify: %w", err)
	}

	w.mu.Lock()
	w.watcher = fw
	w.done = make(chan struct{})
	w.running = true
	w.mu.Unlock()

	if err := w.addRecursive(root); err != nil {
		fw.Close()
		w.mu.Lock()
		w.watcher = nil
		w.running = false
		w.mu.Unlock()
		return fmt.Errorf("add watches: %w", err)
	}

	w.wg.Add(1)
	go w.eventLoop()
	return nil
}

func (w *Watcher) Stop() {
	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return
	}
	w.running = false
	close(w.done)
	w.mu.Unlock()
	// Wait for eventLoop to exit and release fsnotify watcher.
	w.wg.Wait()
}

func (w *Watcher) addRecursive(dir string) error {
	return filepath.Walk(dir, func(path string, fi os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !fi.IsDir() {
			return nil
		}
		name := fi.Name()
		if name != "." && strings.HasPrefix(name, ".") {
			return filepath.SkipDir
		}
		return w.watcher.Add(path)
	})
}

func isMdFile(name string) bool {
	return strings.HasSuffix(strings.ToLower(name), ".md")
}

func (w *Watcher) eventLoop() {
	defer w.wg.Done()
	defer func() {
		w.mu.Lock()
		if w.watcher != nil {
			w.watcher.Close()
			w.watcher = nil
		}
		w.mu.Unlock()
	}()

	for {
		select {
		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}

			if event.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					_ = w.addRecursive(event.Name)
				}
			}

			if event.Op&(fsnotify.Create|fsnotify.Write|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}

			base := filepath.Base(event.Name)
			if strings.HasPrefix(base, ".") {
				continue
			}

			if !isMdFile(event.Name) {
				continue
			}

			if w.callback != nil {
				w.callback(event.Name)
			}

		case _, ok := <-w.watcher.Errors:
			if !ok {
				return
			}

		case <-w.done:
			return
		}
	}
}
