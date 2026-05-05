package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	goruntime "runtime"
	"sync"
	"sync/atomic"

	"mindstack/internal/ack"
	"mindstack/internal/config"
	"mindstack/internal/llm"
	"mindstack/internal/meta"
	"mindstack/internal/relation"
	"mindstack/internal/search"
	syncpkg "mindstack/internal/sync"

	einoschema "github.com/cloudwego/eino/schema"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type FileEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

type App struct {
	ctx              context.Context
	mu               sync.RWMutex
	rootPath         string
	fileServerPort   int
	recentEntries    []RecentEntry
	dialogOpen       int32
	streaming        int32
	syncing          int32
	locale           string
	pendingOpenPath  string
	frontendReady    bool
	debugMode        bool
	llm              *llm.Service
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	setWindowNonOpaque()
	a.llm = llm.NewService(config.ConfigPath())
	if err := a.llm.InitFromConfig(); err != nil {
		fmt.Println("failed to init LLM:", err)
	}
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

var dialogLabels = map[string]map[string]string{
	"en": {
		"openFolder":     "Open Folder",
		"selectImage":    "Select Image",
		"imageFiles":     "Image Files",
		"allFiles":       "All Files",
		"openFile":       "Open File",
		"markdownFiles":  "Markdown Files",
		"textFiles":      "Text Files",
		"confirmDelete":  "Confirm Delete",
		"delete":         "Delete",
		"cancel":         "Cancel",
		"file":           "file",
		"folder":         "folder",
	},
	"ja": {
		"openFolder":     "フォルダを開く",
		"selectImage":    "画像を選択",
		"imageFiles":     "画像ファイル",
		"allFiles":       "すべてのファイル",
		"openFile":       "ファイルを開く",
		"markdownFiles":  "Markdown ファイル",
		"textFiles":      "テキストファイル",
		"confirmDelete":  "削除の確認",
		"delete":         "削除",
		"cancel":         "キャンセル",
		"file":           "ファイル",
		"folder":         "フォルダ",
	},
	"fr": {
		"openFolder":     "Ouvrir le dossier",
		"selectImage":    "Sélectionner une image",
		"imageFiles":     "Fichiers image",
		"allFiles":       "Tous les fichiers",
		"openFile":       "Ouvrir le fichier",
		"markdownFiles":  "Fichiers Markdown",
		"textFiles":      "Fichiers texte",
		"confirmDelete":  "Confirmer la suppression",
		"delete":         "Supprimer",
		"cancel":         "Annuler",
		"file":           "fichier",
		"folder":         "dossier",
	},
	"de": {
		"openFolder":     "Ordner öffnen",
		"selectImage":    "Bild auswählen",
		"imageFiles":     "Bilddateien",
		"allFiles":       "Alle Dateien",
		"openFile":       "Datei öffnen",
		"markdownFiles":  "Markdown-Dateien",
		"textFiles":      "Textdateien",
		"confirmDelete":  "Löschen bestätigen",
		"delete":         "Löschen",
		"cancel":         "Abbrechen",
		"file":           "Datei",
		"folder":         "Ordner",
	},
	"es": {
		"openFolder":     "Abrir carpeta",
		"selectImage":    "Seleccionar imagen",
		"imageFiles":     "Archivos de imagen",
		"allFiles":       "Todos los archivos",
		"openFile":       "Abrir archivo",
		"markdownFiles":  "Archivos Markdown",
		"textFiles":      "Archivos de texto",
		"confirmDelete":  "Confirmar eliminación",
		"delete":         "Eliminar",
		"cancel":         "Cancelar",
		"file":           "archivo",
		"folder":         "carpeta",
	},
	"ru": {
		"openFolder":     "Открыть папку",
		"selectImage":    "Выбрать изображение",
		"imageFiles":     "Файлы изображений",
		"allFiles":       "Все файлы",
		"openFile":       "Открыть файл",
		"markdownFiles":  "Markdown-файлы",
		"textFiles":      "Текстовые файлы",
		"confirmDelete":  "Подтвердить удаление",
		"delete":         "Удалить",
		"cancel":         "Отмена",
		"file":           "файл",
		"folder":         "папка",
	},
	"ko": {
		"openFolder":     "폴더 열기",
		"selectImage":    "이미지 선택",
		"imageFiles":     "이미지 파일",
		"allFiles":       "모든 파일",
		"openFile":       "파일 열기",
		"markdownFiles":  "Markdown 파일",
		"textFiles":      "텍스트 파일",
		"confirmDelete":  "삭제 확인",
		"delete":         "삭제",
		"cancel":         "취소",
		"file":           "파일",
		"folder":         "폴더",
	},
	"zh": {
		"openFolder":     "打开文件夹",
		"selectImage":    "选择图片",
		"imageFiles":     "图片文件",
		"allFiles":       "所有文件",
		"openFile":       "打开文件",
		"markdownFiles":  "Markdown 文件",
		"textFiles":      "文本文件",
		"confirmDelete":  "确认删除",
		"delete":         "删除",
		"cancel":         "取消",
		"file":           "文件",
		"folder":         "文件夹",
	},
}

func (a *App) labelText(labels map[string]map[string]string, key string) string {
	a.mu.RLock()
	locale := a.locale
	a.mu.RUnlock()
	if locale == "" {
		locale = "en"
	}
	m, ok := labels[locale]
	if !ok {
		m = labels["en"]
	}
	if v, ok := m[key]; ok {
		return v
	}
	return key
}

func (a *App) dialogText(key string) string {
	return a.labelText(dialogLabels, key)
}

func (a *App) SetLocale(locale string) {
	a.mu.Lock()
	a.locale = locale
	a.mu.Unlock()
	a.rebuildMenu()
}

func (a *App) SetRootPath(p string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.rootPath = p
}

func (a *App) ClipboardSetText(text string) {
	runtime.ClipboardSetText(a.ctx, text)
}

func (a *App) ClipboardGetText() string {
	text, _ := runtime.ClipboardGetText(a.ctx)
	return text
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
		Title: a.dialogText("openFolder"),
	})
	if err != nil || path == "" {
		return ""
	}
	return path
}

func (a *App) OpenImageFileDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: a.dialogText("selectImage"),
		Filters: []runtime.FileFilter{
			{DisplayName: a.dialogText("imageFiles"), Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.svg;*.webp"},
			{DisplayName: a.dialogText("allFiles"), Pattern: "*.*"},
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
		Title: a.dialogText("openFile"),
		Filters: []runtime.FileFilter{
			{DisplayName: a.dialogText("markdownFiles"), Pattern: "*.md"},
			{DisplayName: a.dialogText("textFiles"), Pattern: "*.txt"},
			{DisplayName: a.dialogText("allFiles"), Pattern: "*.*"},
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

func (a *App) FileExists(filePath string) bool {
	_, err := os.Stat(filePath)
	return err == nil
}

// isMarkdownFilePath reports whether the given path looks like a markdown document
// based on its extension. Used to filter file-association open events so unrelated
// files cannot drive the editor through the system "Open With" mechanism.
func isMarkdownFilePath(p string) bool {
	ext := strings.ToLower(filepath.Ext(p))
	return ext == ".md" || ext == ".markdown"
}

// HandleOpenFile is invoked by the wails Mac.OnFileOpen callback when the user
// opens a markdown file via Finder/file association. If the frontend has already
// announced itself ready, the path is forwarded immediately; otherwise it is
// buffered until the frontend pulls it via GetPendingOpenFile during mount.
func (a *App) HandleOpenFile(filePath string) {
	if filePath == "" || !isMarkdownFilePath(filePath) {
		return
	}
	if _, err := os.Stat(filePath); err != nil {
		return
	}

	a.mu.Lock()
	ready := a.frontendReady
	ctx := a.ctx
	if !ready {
		a.pendingOpenPath = filePath
	}
	a.mu.Unlock()

	if ready && ctx != nil {
		runtime.EventsEmit(ctx, "menu:file:open-path", filePath)
	}
}

// GetPendingOpenFile returns any markdown file path that was opened via the
// system file association before the frontend was ready. The frontend is expected
// to call this once on mount; subsequent open events are delivered through the
// "menu:file:open-path" runtime event.
func (a *App) GetPendingOpenFile() string {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.frontendReady = true
	path := a.pendingOpenPath
	a.pendingOpenPath = ""
	return path
}

func (a *App) IsFullscreen() bool {
	return isWindowFullscreen()
}

func (a *App) ConfirmDelete(name string, isDir bool) bool {
	label := a.dialogText("file")
	if isDir {
		label = a.dialogText("folder")
	}
	result, _ := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.QuestionDialog,
		Title:   a.dialogText("confirmDelete"),
		Message: a.dialogText("delete") + " " + label + " \"" + name + "\"?",
		Buttons: []string{a.dialogText("delete"), a.dialogText("cancel")},
	})
	return result == a.dialogText("delete")
}

func (a *App) DeleteFile(filePath string) error {
	return MoveToTrash(filePath)
}

// WindowClose quits the application.
func (a *App) WindowClose() {
	runtime.Quit(a.ctx)
}

// WindowMinimise minimises the application window.
func (a *App) WindowMinimise() {
	runtime.WindowMinimise(a.ctx)
}

// WindowMaximise maximises the application window.
func (a *App) WindowMaximise() {
	runtime.WindowMaximise(a.ctx)
}

// WindowToggleMaximise toggles the maximise state of the application window.
func (a *App) WindowToggleMaximise() {
	runtime.WindowToggleMaximise(a.ctx)
}

// WindowIsMaximised reports whether the window is currently maximised.
func (a *App) WindowIsMaximised() bool {
	return runtime.WindowIsMaximised(a.ctx)
}

// GetPlatform returns the current operating system platform.
func (a *App) GetPlatform() string {
	return goruntime.GOOS
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

func (a *App) Chat(messagesJSON string) string {
	var msgs []*einoschema.Message
	if err := json.Unmarshal([]byte(messagesJSON), &msgs); err != nil {
		out, _ := json.Marshal(map[string]string{"error": "parse messages: " + err.Error()})
		return string(out)
	}
	resp, err := a.llm.Chat(a.ctx, msgs)
	if err != nil {
		out, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(out)
	}
	out, _ := json.Marshal(map[string]string{"content": resp})
	return string(out)
}

func (a *App) StreamChat(messagesJSON string) string {
	var msgs []*einoschema.Message
	if err := json.Unmarshal([]byte(messagesJSON), &msgs); err != nil {
		out, _ := json.Marshal(map[string]string{"error": "parse messages: " + err.Error()})
		return string(out)
	}

	if !atomic.CompareAndSwapInt32(&a.streaming, 0, 1) {
		out, _ := json.Marshal(map[string]string{"error": "stream already in progress"})
		return string(out)
	}

	go func() {
		defer atomic.StoreInt32(&a.streaming, 0)
		_ = a.llm.StreamChat(a.ctx, msgs, func(chunk llm.StreamChunk) {
			data, _ := json.Marshal(chunk)
			runtime.EventsEmit(a.ctx, "llm:chunk", string(data))
		})
	}()
	return ""
}

func (a *App) SyncWorkspace() string {
	a.mu.RLock()
	root := a.rootPath
	a.mu.RUnlock()

	if root == "" {
		return `{"error":"no workspace open"}`
	}

	if !atomic.CompareAndSwapInt32(&a.syncing, 0, 1) {
		out, _ := json.Marshal(map[string]string{"error": "sync already in progress"})
		return string(out)
	}

	go func() {
		defer atomic.StoreInt32(&a.syncing, 0)
		err := syncpkg.SyncWorkspace(a.ctx, a.llm, root, func(p syncpkg.SyncProgress) {
			data, _ := json.Marshal(p)
			runtime.EventsEmit(a.ctx, "sync:progress", string(data))
		})
		if err != nil {
			errMsg, _ := json.Marshal(syncpkg.SyncProgress{Status: "error", Error: err.Error()})
			runtime.EventsEmit(a.ctx, "sync:progress", string(errMsg))
		}
	}()

	return ""
}

func (a *App) ReloadLLM() string {
	if err := a.llm.InitFromConfig(); err != nil {
		return err.Error()
	}
	return ""
}

func (a *App) GetActiveModelInfo() string {
	m := a.llm.GetActiveModel()
	if m == nil {
		return `{"configured":false}`
	}
	out, _ := json.Marshal(map[string]interface{}{
		"configured": true,
		"id":         m.ID,
		"model":      m.Model,
	})
	return string(out)
}

type RecentEntry struct {
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

type AppConfig struct {
	LastFolderPath string        `json:"lastFolderPath"`
	LastFilePath   string        `json:"lastFilePath"`
	RecentEntries  []RecentEntry `json:"recentEntries"`
	Settings       struct {
		DebugMode bool `json:"debugMode"`
	} `json:"settings"`
}

func (a *App) LoadConfig() string {
	data, err := os.ReadFile(config.ConfigPath())
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
		a.debugMode = cfg.Settings.DebugMode
		a.mu.Unlock()
	}
	return string(data)
}

func (a *App) SaveConfig(jsonStr string) string {
	cp := config.ConfigPath()
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
	cp := config.ConfigPath()
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

func (a *App) SearchDocs(tag string) string {
	a.mu.RLock()
	root := a.rootPath
	a.mu.RUnlock()

	if root == "" {
		return `{"error":"no workspace open"}`
	}

	result, err := search.SearchByTag(root, tag, "", true)
	if err != nil {
		out, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(out)
	}
	out, _ := json.Marshal(result)
	return string(out)
}

func (a *App) Ack(query string) string {
	a.mu.RLock()
	root := a.rootPath
	locale := a.locale
	a.mu.RUnlock()

	if root == "" {
		return `{"error":"no workspace open"}`
	}

	result, err := ack.Ack(a.ctx, a.llm, root, query, locale)
	if err != nil {
		out, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(out)
	}
	out, _ := json.Marshal(result)
	return string(out)
}

func (a *App) GetDocumentMetas() string {
	a.mu.RLock()
	root := a.rootPath
	a.mu.RUnlock()

	if root == "" {
		return `{"error":"no workspace open"}`
	}

	metas, err := meta.ScanAll(root, "")
	if err != nil {
		out, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(out)
	}
	out, _ := json.Marshal(metas)
	return string(out)
}

func (a *App) GetDocumentRelations() string {
	a.mu.RLock()
	root := a.rootPath
	a.mu.RUnlock()

	if root == "" {
		return `{"error":"no workspace open"}`
	}

	store, err := relation.Load(root)
	if err != nil {
		out, _ := json.Marshal(map[string]string{"error": err.Error()})
		return string(out)
	}
	out, _ := json.Marshal(store)
	return string(out)
}
