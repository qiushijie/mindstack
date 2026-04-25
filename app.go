package main

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type FileEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

type App struct {
	ctx            context.Context
	mu             sync.RWMutex
	rootPath       string
	fileServerPort int
	recentEntries  []RecentEntry
	dialogOpen     int32
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.startFileServer()
	a.rebuildMenu()
}

func (a *App) startFileServer() {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return
	}
	a.fileServerPort = listener.Addr().(*net.TCPAddr).Port
	handler := NewLocalFileHandler(a)
	server := &http.Server{Handler: handler}
	go server.Serve(listener)
}

func (a *App) SetRootPath(p string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.rootPath = p
}

func (a *App) GetRootPath() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.rootPath
}

func (a *App) SetWorkspaceRoot(p string) {
	a.SetRootPath(p)
}

func (a *App) GetFileServerPort() int {
	return a.fileServerPort
}

func (a *App) OpenFolderDialog() string {
	if !atomic.CompareAndSwapInt32(&a.dialogOpen, 0, 1) {
		return ""
	}
	defer atomic.StoreInt32(&a.dialogOpen, 0)

	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open Folder",
	})
	if err != nil || path == "" {
		return ""
	}
	return path
}

func (a *App) OpenImageFileDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Image",
		Filters: []runtime.FileFilter{
			{DisplayName: "Image Files", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.svg;*.webp"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil || path == "" {
		return ""
	}
	return path
}

func (a *App) OpenFileDialog() string {
	if !atomic.CompareAndSwapInt32(&a.dialogOpen, 0, 1) {
		return ""
	}
	defer atomic.StoreInt32(&a.dialogOpen, 0)

	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Open File",
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown Files", Pattern: "*.md"},
			{DisplayName: "Text Files", Pattern: "*.txt"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	if err != nil || path == "" {
		return ""
	}
	return path
}

func (a *App) ReadDirEntries(dirPath string) []FileEntry {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil
	}

	var result []FileEntry
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		isDir := entry.IsDir()
		if !isDir && !strings.HasSuffix(strings.ToLower(name), ".md") {
			continue
		}
		result = append(result, FileEntry{
			Name:  name,
			Path:  filepath.Join(dirPath, name),
			IsDir: isDir,
		})
	}

	sort.SliceStable(result, func(i, j int) bool {
		if result[i].IsDir != result[j].IsDir {
			return result[i].IsDir
		}
		return strings.ToLower(result[i].Name) < strings.ToLower(result[j].Name)
	})

	return result
}

func (a *App) ReadFileContent(filePath string) string {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return ""
	}
	return string(data)
}

func (a *App) SaveFileContent(filePath string, content string) string {
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err.Error()
	}
	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return err.Error()
	}
	return ""
}

type RecentEntry struct {
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

type AppConfig struct {
	LastFolderPath string        `json:"lastFolderPath"`
	LastFilePath   string        `json:"lastFilePath"`
	RecentEntries  []RecentEntry `json:"recentEntries"`
}

func configPath() string {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	return filepath.Join(dir, "mindstack", "config.json")
}

func (a *App) LoadConfig() string {
	data, err := os.ReadFile(configPath())
	if err != nil {
		return "{}"
	}
	// Cache recent entries for menu building
	var cfg AppConfig
	if json.Unmarshal(data, &cfg) == nil {
		a.mu.Lock()
		a.recentEntries = cfg.RecentEntries
		if a.recentEntries == nil {
			a.recentEntries = []RecentEntry{}
		}
		a.mu.Unlock()
	}
	return string(data)
}

func (a *App) SaveConfig(jsonStr string) string {
	cp := configPath()
	dir := filepath.Dir(cp)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err.Error()
	}
	if err := os.WriteFile(cp, []byte(jsonStr), 0644); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) AddRecentEntry(path string, isDir bool) {
	a.mu.Lock()
	// Deduplicate: remove existing entry with same path
	filtered := make([]RecentEntry, 0, len(a.recentEntries))
	for _, e := range a.recentEntries {
		if e.Path != path {
			filtered = append(filtered, e)
		}
	}
	// Prepend new entry
	a.recentEntries = append([]RecentEntry{{Path: path, IsDir: isDir}}, filtered...)
	// Cap at 10
	if len(a.recentEntries) > 10 {
		a.recentEntries = a.recentEntries[:10]
	}
	a.saveRecentEntriesLocked()
	a.mu.Unlock()

	a.rebuildMenu()
}

func (a *App) ClearRecentEntries() {
	a.mu.Lock()
	a.recentEntries = []RecentEntry{}
	a.saveRecentEntriesLocked()
	a.mu.Unlock()

	a.rebuildMenu()
}

// removeRecentEntry removes an entry by path and rebuilds the menu.
func (a *App) removeRecentEntry(path string) {
	a.mu.Lock()
	filtered := make([]RecentEntry, 0, len(a.recentEntries))
	for _, e := range a.recentEntries {
		if e.Path != path {
			filtered = append(filtered, e)
		}
	}
	a.recentEntries = filtered
	a.saveRecentEntriesLocked()
	a.mu.Unlock()

	a.rebuildMenu()
}

// saveRecentEntriesLocked reads the current config JSON, merges recentEntries, and writes back.
// Must be called with a.mu held.
func (a *App) saveRecentEntriesLocked() {
	cp := configPath()
	data, err := os.ReadFile(cp)
	if err != nil {
		data = []byte("{}")
	}

	var raw map[string]interface{}
	if json.Unmarshal(data, &raw) != nil {
		raw = make(map[string]interface{})
	}

	entries := make([]interface{}, len(a.recentEntries))
	for i, e := range a.recentEntries {
		entries[i] = map[string]interface{}{
			"path":  e.Path,
			"isDir": e.IsDir,
		}
	}
	raw["recentEntries"] = entries

	out, err := json.MarshalIndent(raw, "", "  ")
	if err != nil {
		return
	}

	dir := filepath.Dir(cp)
	os.MkdirAll(dir, 0755)
	os.WriteFile(cp, out, 0644)
}
