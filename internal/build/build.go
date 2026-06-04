package build

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"mindstack/internal/llm"
	"mindstack/internal/meta"
	"mindstack/internal/relation"
	"mindstack/internal/workspace"

	einoschema "github.com/cloudwego/eino/schema"
)

// BuildProgress is emitted for each step processed.
type BuildProgress struct {
	File    string `json:"file"`
	Current int    `json:"current"`
	Total   int    `json:"total"`
	Status  string `json:"status"` // "processing" | "done" | "error" | "complete" | "skipped" | "analyzing"
	Error   string `json:"error,omitempty"`
	Summary string `json:"summary,omitempty"`
	Phase   string `json:"phase"` // "meta" | "relation"
}

type candidateInfo struct {
	path       string
	sharedTags []string
}

// BuildWorkspace scans all markdown files under rootPath and generates
// summary + tags metadata for each one using the LLM service,
// then analyzes document relations based on shared tags.
func BuildWorkspace(
	ctx context.Context,
	llmSvc *llm.Service,
	rootPath string,
	force bool,
	onProgress func(BuildProgress),
) error {
	if onProgress == nil {
		onProgress = func(BuildProgress) {}
	}

	files := listMarkdownFiles(rootPath)
	total := len(files)

	// Clean up meta and relations for deleted files
	existingSet := make(map[string]bool, len(files))
	for _, f := range files {
		existingSet[f] = true
	}
	removed, err := meta.RemoveStale(rootPath, existingSet)
	if err != nil {
		onProgress(BuildProgress{Status: "error", Error: fmt.Sprintf("cleanup meta: %v", err), Phase: "meta"})
	}
	if len(removed) > 0 {
		store, err := relation.Load(rootPath)
		if err != nil {
			onProgress(BuildProgress{Status: "error", Error: fmt.Sprintf("load relations for cleanup: %v", err), Phase: "meta"})
		} else {
			for _, p := range removed {
				relation.RemoveByDoc(store, p)
			}
			if err := relation.Save(rootPath, store); err != nil {
				onProgress(BuildProgress{Status: "error", Error: fmt.Sprintf("save relations after cleanup: %v", err), Phase: "meta"})
			}
		}
	}

	if total == 0 {
		onProgress(BuildProgress{Status: "complete", Total: 0, Current: 0, Phase: "meta"})
		return nil
	}

	// Phase 1: Meta generation (incremental)
	changedDocs := make(map[string]bool)

	for i, relPath := range files {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		onProgress(BuildProgress{
			File:    relPath,
			Current: i + 1,
			Total:   total,
			Status:  "processing",
			Phase:   "meta",
		})

		absPath := filepath.Join(rootPath, relPath)
		content, err := os.ReadFile(absPath)
		if err != nil {
			onProgress(BuildProgress{
				File:    relPath,
				Current: i + 1,
				Total:   total,
				Status:  "error",
				Error:   fmt.Sprintf("read: %v", err),
				Phase:   "meta",
			})
			continue
		}

		hash := computeHash(content)
		existing, _ := meta.LoadMeta(rootPath, relPath)
		if !force && existing != nil && existing.ContentHash == hash && len(existing.Headings) > 0 {
			onProgress(BuildProgress{
				File:    relPath,
				Current: i + 1,
				Total:   total,
				Status:  "skipped",
				Phase:   "meta",
			})
			continue
		}

		result, err := generateMeta(ctx, llmSvc, relPath, string(content))
		if err != nil {
			onProgress(BuildProgress{
				File:    relPath,
				Current: i + 1,
				Total:   total,
				Status:  "error",
				Error:   fmt.Sprintf("llm: %v", err),
				Phase:   "meta",
			})
			continue
		}

		if existing != nil && existing.Status != "" {
			result.Status = existing.Status
		}
		result.Path = relPath
		result.ContentHash = hash

		if err := meta.SaveMeta(rootPath, relPath, result); err != nil {
			onProgress(BuildProgress{
				File:    relPath,
				Current: i + 1,
				Total:   total,
				Status:  "error",
				Error:   fmt.Sprintf("save: %v", err),
				Phase:   "meta",
			})
			continue
		}

		changedDocs[relPath] = true

		onProgress(BuildProgress{
			File:    relPath,
			Current: i + 1,
			Total:   total,
			Status:  "done",
			Summary: result.Summary,
			Phase:   "meta",
		})
	}

	onProgress(BuildProgress{
		Current: total,
		Total:   total,
		Status:  "complete",
		Phase:   "meta",
	})

	// If no content changed but relations.json is missing, rebuild all relations
	if len(changedDocs) == 0 {
		if _, err := os.Stat(filepath.Join(rootPath, workspace.KnowledgeBaseDir, "relations.json")); os.IsNotExist(err) {
			allMetas, scanErr := meta.ScanAll(rootPath, "")
			if scanErr != nil {
				return fmt.Errorf("scan meta for relation rebuild: %w", scanErr)
			}
			for _, m := range allMetas {
				changedDocs[m.Path] = true
			}
		}
	}

	// Phase 2: Relation analysis
	if err := analyzeRelations(ctx, llmSvc, rootPath, changedDocs, onProgress); err != nil {
		onProgress(BuildProgress{
			Status: "error",
			Error:  fmt.Sprintf("relation analysis: %v", err),
			Phase:  "relation",
		})
	}

	return nil
}

func analyzeRelations(
	ctx context.Context,
	llmSvc *llm.Service,
	rootPath string,
	changedDocs map[string]bool,
	onProgress func(BuildProgress),
) error {
	if len(changedDocs) == 0 {
		onProgress(BuildProgress{Status: "complete", Phase: "relation"})
		return nil
	}

	allMetas, err := meta.ScanAll(rootPath, "")
	if err != nil {
		return fmt.Errorf("scan meta: %w", err)
	}

	candidates := findCandidateDocs(allMetas, changedDocs)
	if len(candidates) == 0 {
		onProgress(BuildProgress{Status: "complete", Phase: "relation"})
		return nil
	}

	store, err := relation.Load(rootPath)
	if err != nil {
		return fmt.Errorf("load relations: %w", err)
	}
	for docPath := range changedDocs {
		relation.RemoveByDoc(store, docPath)
	}

	metaMap := make(map[string]*meta.DocumentMeta, len(allMetas))
	for _, m := range allMetas {
		metaMap[m.Path] = m
	}

	docList := sortedKeys(candidates)
	totalDocs := len(docList)

	for i, docPath := range docList {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		onProgress(BuildProgress{
			File:    docPath,
			Current: i + 1,
			Total:   totalDocs,
			Status:  "analyzing",
			Phase:   "relation",
			Summary: fmt.Sprintf("%d candidates", len(candidates[docPath])),
		})

		relations, err := analyzeDocRelations(ctx, llmSvc, docPath, candidates[docPath], metaMap)
		if err != nil {
			onProgress(BuildProgress{
				File:    docPath,
				Current: i + 1,
				Total:   totalDocs,
				Status:  "error",
				Error:   fmt.Sprintf("%v", err),
				Phase:   "relation",
			})
			continue
		}

		relation.AddRelations(store, relations)

		onProgress(BuildProgress{
			File:    docPath,
			Current: i + 1,
			Total:   totalDocs,
			Status:  "done",
			Phase:   "relation",
			Summary: fmt.Sprintf("found %d relations", len(relations)),
		})
	}

	if err := relation.Save(rootPath, store); err != nil {
		return fmt.Errorf("save relations: %w", err)
	}

	onProgress(BuildProgress{
		Status: "complete",
		Phase:  "relation",
	})
	return nil
}

func generateMeta(ctx context.Context, svc *llm.Service, filename string, content string) (*meta.DocumentMeta, error) {
	prompt := fmt.Sprintf(`Analyze the following markdown document and generate metadata.

Document filename: %s

Document content:
%s

Respond with ONLY a JSON object (no markdown, no code fences) with these fields:
- "summary": a 1-3 sentence summary of the document's content. Write the summary in the SAME language as the document content. If the document is in Chinese, write the summary in Chinese. If the document is in English, write the summary in English. Do not mix languages.
- "tags": an array of 3-5 domain-specific tags. Rules:
  - Use lowercase with hyphens for multi-word tags (e.g. "rest-api", "error-handling").
  - Prefer specific, discriminating terms over generic ones. Good: "rest-api", "exponential-backoff". Bad: "system", "design", "filter", "approach".
  - Each tag should be useful for distinguishing this document from others in the same knowledge base.
  - Only include tags that capture the document's core topic, not every technology mentioned in passing.
- "headings": an array of ALL section headings in the document, starting from level 1 (the top-level heading). Each item is an object with "level" (integer 1-6, where 1 is the document's main heading) and "text" (string, the heading text). Preserve the original heading hierarchy and include every meaningful heading. Skip generic headings like "Introduction", "Summary", or "Conclusion". Merge closely related subsections when appropriate.

Example response:
{"summary":"Guidelines for designing RESTful APIs including URL structure, status codes, and pagination patterns.","tags":["rest-api","http-status-codes","pagination"],"headings":[{"level":1,"text":"Overview"},{"level":2,"text":"URL Structure"},{"level":2,"text":"Status Codes"},{"level":3,"text":"Pagination"}]}`, filename, content)

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: prompt},
	}

	resp, err := svc.Chat(ctx, messages)
	if err != nil {
		return nil, err
	}

	cleaned := stripCodeFences(resp)

	var parsed struct {
		Summary  string         `json:"summary"`
		Tags     []string       `json:"tags"`
		Headings []meta.Heading `json:"headings"`
	}
	if err := json.Unmarshal([]byte(cleaned), &parsed); err != nil {
		return nil, fmt.Errorf("parse LLM response: %w (raw: %s)", err, resp)
	}

	title := ""
	if len(parsed.Headings) > 0 {
		title = parsed.Headings[0].Text
	}
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	}

	return &meta.DocumentMeta{
		Title:    title,
		Summary:  parsed.Summary,
		Tags:     parsed.Tags,
		Headings: parsed.Headings,
		Status:   "active",
	}, nil
}

func analyzeDocRelations(
	ctx context.Context,
	svc *llm.Service,
	docPath string,
	candidates []candidateInfo,
	metaMap map[string]*meta.DocumentMeta,
) ([]relation.Relation, error) {
	doc := metaMap[docPath]
	if doc == nil {
		return nil, nil
	}

	var candidateBuilder strings.Builder
	for _, c := range candidates {
		m := metaMap[c.path]
		if m == nil {
			continue
		}
		candidateBuilder.WriteString(fmt.Sprintf("- %q | title: %s | headings: %q | summary: %s | tags: %v | shared tags: %v\n", c.path, m.Title, headingTexts(m.Headings), m.Summary, m.Tags, c.sharedTags))
	}

	prompt := fmt.Sprintf(`Given the following document:
- path: %q
- title: %s
- headings: [%s]
- summary: %s
- tags: %v

Evaluate how related it is to each of the following documents:

%s

Respond with ONLY a JSON array (no markdown, no code fences):
[{"target":"path/to/doc.md","score":0.8,"reason":"brief explanation","type":"references"}]

Rules:
- You MUST return an entry for EVERY document listed above, do not skip any
- Score 0 means unrelated, 1 means highly related
- Reason should be one concise sentence
- Type should be a brief semantic relationship type (e.g., "references", "extends", "contrasts", "depends-on", "is-prerequisite-for"). Use lowercase with hyphens. Be specific and descriptive.
- Use the exact file paths from the candidate list`, docPath, doc.Title, headingTexts(doc.Headings), doc.Summary, doc.Tags, candidateBuilder.String())

	messages := []*einoschema.Message{
		{Role: einoschema.User, Content: prompt},
	}

	candidateKeys := make(map[string]bool, len(candidates))
	candidateTagsMap := make(map[string][]string, len(candidates))
	for _, c := range candidates {
		candidateKeys[c.path] = true
		candidateTagsMap[c.path] = c.sharedTags
	}

	type llmResult struct {
		Target string  `json:"target"`
		Score  float64 `json:"score"`
		Reason string  `json:"reason"`
		Type   string  `json:"type"`
	}

	// Initial LLM call
	resp, err := svc.Chat(ctx, messages)
	if err != nil {
		return nil, err
	}

	var results []llmResult
	cleaned := stripCodeFences(resp)
	if err := json.Unmarshal([]byte(cleaned), &results); err != nil {
		return nil, fmt.Errorf("parse LLM response: %w (raw: %s)", err, resp)
	}

	// Retry up to 2 times for missing candidates (incremental append)
	for attempt := 0; attempt < 2; attempt++ {
		covered := make(map[string]bool, len(results))
		for _, r := range results {
			covered[r.Target] = true
		}

		var missing []string
		for key := range candidateKeys {
			if !covered[key] {
				missing = append(missing, "- "+key)
			}
		}

		if len(missing) == 0 {
			break
		}

		retryPrompt := fmt.Sprintf(`You missed the following documents. Please evaluate them:
%s

Respond with ONLY a JSON array:
[{"target":"path/to/doc.md","score":0.8,"reason":"brief explanation","type":"references"}]`, strings.Join(missing, "\n"))

		retryResp, err := svc.Chat(ctx, []*einoschema.Message{
			{Role: einoschema.User, Content: prompt},
			{Role: einoschema.Assistant, Content: resp},
			{Role: einoschema.User, Content: retryPrompt},
		})
		if err != nil {
			return nil, err
		}

		var retryResults []llmResult
		cleanedRetry := stripCodeFences(retryResp)
		if err := json.Unmarshal([]byte(cleanedRetry), &retryResults); err != nil {
			return nil, fmt.Errorf("parse retry response: %w (raw: %s)", err, retryResp)
		}

		results = append(results, retryResults...)
	}

	var filtered []relation.Relation
	for _, r := range results {
		if r.Score < 0.3 {
			continue
		}
		if !candidateKeys[r.Target] {
			continue
		}
		filtered = append(filtered, relation.Relation{
			Source:     docPath,
			Target:     r.Target,
			Score:      r.Score,
			Reason:     r.Reason,
			SharedTags: candidateTagsMap[r.Target],
			Type:       r.Type,
		})
	}

	return filtered, nil
}

func findCandidateDocs(allMetas []*meta.DocumentMeta, changedDocs map[string]bool) map[string][]candidateInfo {
	// Build a lookup: path -> normalized set (tags, all lowercase)
	tagMap := make(map[string]map[string]bool, len(allMetas))
	for _, m := range allMetas {
		s := make(map[string]bool, len(m.Tags))
		for _, t := range m.Tags {
			s[strings.ToLower(t)] = true
		}
		tagMap[m.Path] = s
	}

	result := make(map[string][]candidateInfo)

	for _, changedDoc := range sortedKeys(changedDocs) {
		changedSet := tagMap[changedDoc]
		if len(changedSet) == 0 {
			continue
		}

		for _, m := range allMetas {
			if m.Path == changedDoc {
				continue
			}
			var shared []string
			for _, t := range m.Tags {
				if changedSet[strings.ToLower(t)] {
					shared = append(shared, t)
				}
			}
			if len(shared) > 0 {
				result[changedDoc] = append(result[changedDoc], candidateInfo{
					path:       m.Path,
					sharedTags: shared,
				})
			}
		}
	}

	return result
}

// sortedKeys returns the keys of a map whose key type is ~string, sorted lexicographically.
func sortedKeys[M ~map[K]V, K ~string, V any](m M) []K {
	keys := make([]K, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		return keys[i] < keys[j]
	})
	return keys
}

func computeHash(data []byte) string {
	h := sha256.Sum256(data)
	return fmt.Sprintf("%x", h)
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

// listMarkdownFiles collects all markdown files under rootPath as relative paths.
// WalkDir error is intentionally ignored because the caller (BuildWorkspace) handles
// the case where no files are found (e.g. rootPath does not exist).
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
			rel, err := filepath.Rel(rootPath, path)
			if err != nil {
				// Skip file if relative path cannot be resolved
				return nil
			}
			files = append(files, rel)
		}
		return nil
	})
	return files
}

// headingTexts extracts the text from a slice of Heading values.
func headingTexts(headings []meta.Heading) []string {
	out := make([]string, 0, len(headings))
	for _, h := range headings {
		if h.Text != "" {
			out = append(out, h.Text)
		}
	}
	return out
}
