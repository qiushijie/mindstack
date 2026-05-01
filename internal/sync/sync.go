package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"mindstack/internal/llm"
	"mindstack/internal/meta"
	"mindstack/internal/workspace"

	einoschema "github.com/cloudwego/eino/schema"
)

const maxContentLength = 8000

// SyncProgress is emitted for each file processed.
type SyncProgress struct {
	File    string `json:"file"`
	Current int    `json:"current"`
	Total   int    `json:"total"`
	Status  string `json:"status"` // "processing" | "done" | "error" | "complete"
	Error   string `json:"error,omitempty"`
	Summary string `json:"summary,omitempty"`
}

// SyncWorkspace scans all markdown files under rootPath and generates
// summary + tags metadata for each one using the LLM service.
func SyncWorkspace(
	ctx context.Context,
	llmSvc *llm.Service,
	rootPath string,
	onProgress func(SyncProgress),
) error {
	if onProgress == nil {
		onProgress = func(SyncProgress) {}
	}

	files := listMarkdownFiles(rootPath)
	total := len(files)

	if total == 0 {
		onProgress(SyncProgress{Status: "complete", Total: 0, Current: 0})
		return nil
	}

	for i, relPath := range files {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		onProgress(SyncProgress{
			File:    relPath,
			Current: i + 1,
			Total:   total,
			Status:  "processing",
		})

		absPath := filepath.Join(rootPath, relPath)
		content, err := os.ReadFile(absPath)
		if err != nil {
			onProgress(SyncProgress{
				File:    relPath,
				Current: i + 1,
				Total:   total,
				Status:  "error",
				Error:   fmt.Sprintf("read: %v", err),
			})
			continue
		}

		truncated := truncateContent(string(content), maxContentLength)
		result, err := generateMeta(ctx, llmSvc, relPath, truncated)
		if err != nil {
			onProgress(SyncProgress{
				File:    relPath,
				Current: i + 1,
				Total:   total,
				Status:  "error",
				Error:   fmt.Sprintf("llm: %v", err),
			})
			continue
		}

		existing, _ := meta.LoadMeta(rootPath, relPath)
		if existing != nil && existing.Status != "" {
			result.Status = existing.Status
		}
		result.Path = relPath

		if err := meta.SaveMeta(rootPath, relPath, result); err != nil {
			onProgress(SyncProgress{
				File:    relPath,
				Current: i + 1,
				Total:   total,
				Status:  "error",
				Error:   fmt.Sprintf("save: %v", err),
			})
			continue
		}

		onProgress(SyncProgress{
			File:    relPath,
			Current: i + 1,
			Total:   total,
			Status:  "done",
			Summary: result.Summary,
		})
	}

	onProgress(SyncProgress{
		Current: total,
		Total:   total,
		Status:  "complete",
	})
	return nil
}

func generateMeta(ctx context.Context, svc *llm.Service, filename string, content string) (*meta.DocumentMeta, error) {
	prompt := fmt.Sprintf(`Analyze the following markdown document and generate metadata.

Document filename: %s

Document content:
%s

Respond with ONLY a JSON object (no markdown, no code fences) with these fields:
- "title": a concise title for the document (string)
- "summary": a 1-3 sentence summary of the document's content (string)
- "tags": an array of 3-7 relevant tags (array of strings, lowercase, use hyphens for multi-word tags)

Example response:
{"title":"REST API Design Guide","summary":"Guidelines for designing RESTful APIs including URL structure, status codes, and pagination patterns.","tags":["api","rest","design","backend"]}`, filename, content)

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: prompt},
	}

	resp, err := svc.Chat(ctx, messages)
	if err != nil {
		return nil, err
	}

	cleaned := stripCodeFences(resp)

	var parsed struct {
		Title   string   `json:"title"`
		Summary string   `json:"summary"`
		Tags    []string `json:"tags"`
	}
	if err := json.Unmarshal([]byte(cleaned), &parsed); err != nil {
		return nil, fmt.Errorf("parse LLM response: %w (raw: %s)", err, resp)
	}

	return &meta.DocumentMeta{
		Title:   parsed.Title,
		Summary: parsed.Summary,
		Tags:    parsed.Tags,
		Status:  "active",
	}, nil
}

func truncateContent(content string, maxLen int) string {
	runes := []rune(content)
	if len(runes) <= maxLen {
		return content
	}
	return string(runes[:maxLen]) + "\n... [truncated]"
}

func stripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```json") {
		s = strings.TrimPrefix(s, "```json")
	} else if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
	}
	if strings.HasSuffix(s, "```") {
		s = strings.TrimSuffix(s, "```")
	}
	return strings.TrimSpace(s)
}

func listMarkdownFiles(rootPath string) []string {
	var files []string
	filepath.WalkDir(rootPath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if d.Name() == workspace.KnowledgeBaseDir {
				return filepath.SkipDir
			}
			if strings.HasPrefix(d.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		ext := strings.ToLower(filepath.Ext(d.Name()))
		if ext == ".md" || ext == ".markdown" {
			rel, _ := filepath.Rel(rootPath, path)
			files = append(files, rel)
		}
		return nil
	})
	return files
}
