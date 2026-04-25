package main

import (
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const localFilePrefix = "/local-file/"

var allowedImageExts = map[string]bool{
	".png":  true,
	".jpg":  true,
	".jpeg": true,
	".gif":  true,
	".svg":  true,
	".webp": true,
	".bmp":  true,
	".ico":  true,
}

type LocalFileHandler struct {
	app *App
}

func NewLocalFileHandler(app *App) *LocalFileHandler {
	return &LocalFileHandler{app: app}
}

func (h *LocalFileHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet || !strings.HasPrefix(r.URL.Path, localFilePrefix) {
		http.NotFound(w, r)
		return
	}

	rootPath := h.app.GetRootPath()
	if rootPath == "" {
		http.NotFound(w, r)
		return
	}

	encodedPath := strings.TrimPrefix(r.URL.Path, localFilePrefix)
	filePath, err := url.PathUnescape(encodedPath)
	if err != nil {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	if !filepath.IsAbs(filePath) {
		http.Error(w, "relative path not allowed", http.StatusBadRequest)
		return
	}

	cleanPath := filepath.Clean(filePath)

	resolvedPath, err := filepath.EvalSymlinks(cleanPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	resolvedRoot, err := filepath.EvalSymlinks(rootPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	rel, err := filepath.Rel(resolvedRoot, resolvedPath)
	if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		http.Error(w, "access denied", http.StatusForbidden)
		return
	}

	ext := strings.ToLower(filepath.Ext(cleanPath))
	if !allowedImageExts[ext] {
		http.Error(w, "file type not allowed", http.StatusForbidden)
		return
	}

	data, err := os.ReadFile(resolvedPath)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	mimeType := mime.TypeByExtension(ext)
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(data)
}
