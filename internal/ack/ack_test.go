package ack

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"mindstack/internal/meta"
	"mindstack/internal/retrieval"

	einoschema "github.com/cloudwego/eino/schema"
)

// fakeLLM is a programmable LLMClient that returns canned responses keyed on
// substring of the incoming prompt. Lookups use the first matching key.
type fakeLLM struct {
	responses []fakeResp
	calls     int
	mu        sync.Mutex
}

type fakeResp struct {
	match string
	body  string
	err   error
}

func (f *fakeLLM) Chat(_ context.Context, messages []*einoschema.Message) (string, error) {
	f.mu.Lock()
	f.calls++
	prompt := ""
	if len(messages) > 0 {
		prompt = messages[0].Content
	}
	responses := f.responses
	f.mu.Unlock()
	for _, r := range responses {
		if strings.Contains(prompt, r.match) {
			return r.body, r.err
		}
	}
	return "", nil
}

func TestStripJSONFences(t *testing.T) {
	cases := map[string]string{
		"plain":            "plain",
		"```json\n[]\n```": "[]",
		"```\n{\"a\":1}\n```": "{\"a\":1}",
		"  ```json\nx\n```  ": "x",
	}
	for in, want := range cases {
		if got := stripJSONFences(in); got != want {
			t.Errorf("stripJSONFences(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestSplitLines(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"a", []string{"a"}},
		{"a\n", []string{"a"}},
		{"a\nb", []string{"a", "b"}},
		{"a\n\nb\n", []string{"a", "", "b"}},
	}
	for _, c := range cases {
		got := splitLines(c.in)
		if len(got) != len(c.want) {
			t.Errorf("splitLines(%q) len = %d, want %d", c.in, len(got), len(c.want))
			continue
		}
		for i := range got {
			if got[i] != c.want[i] {
				t.Errorf("splitLines(%q)[%d] = %q, want %q", c.in, i, got[i], c.want[i])
			}
		}
	}
}

func TestSelectTagCandidates_IncludesQueryMatchingLowFrequencyTag(t *testing.T) {
	metas := []*meta.DocumentMeta{
		{Tags: []string{"api", "exponential-backoff"}},
		{Tags: []string{"api", "rest"}},
		{Tags: []string{"api", "rest"}},
	}
	candidates, counts := selectTagCandidates(metas, "what is the exponential backoff policy")
	if len(candidates) == 0 {
		t.Fatal("expected candidate tags")
	}
	hasBackoff := false
	for _, t := range candidates {
		if t == "exponential-backoff" {
			hasBackoff = true
			break
		}
	}
	if !hasBackoff {
		t.Errorf("expected low-frequency tag exponential-backoff to be included, got %v (counts %v)", candidates, counts)
	}
}

func TestFormatTagsWithCounts(t *testing.T) {
	t.Run("formats_with_counts", func(t *testing.T) {
		tags := []string{"api", "rest"}
		counts := map[string]int{"api": 3, "rest": 1}
		got := formatTagsWithCounts(tags, counts)
		if !strings.Contains(got, "- api (3 docs)") {
			t.Errorf("missing formatted api tag, got: %s", got)
		}
		if !strings.Contains(got, "- rest (1 docs)") {
			t.Errorf("missing formatted rest tag, got: %s", got)
		}
	})

	t.Run("empty_tags", func(t *testing.T) {
		got := formatTagsWithCounts(nil, nil)
		if got != "" {
			t.Errorf("expected empty, got %q", got)
		}
	})
}

func TestContentCache(t *testing.T) {
	root := t.TempDir()
	rel := "test.md"
	full := filepath.Join(root, rel)
	if err := os.WriteFile(full, []byte("Hello World"), 0644); err != nil {
		t.Fatal(err)
	}

	cache := newContentCache()

	raw, err := cache.getRaw(root, rel)
	if err != nil {
		t.Fatal(err)
	}
	if raw != "Hello World" {
		t.Fatalf("first getRaw: got %q, want %q", raw, "Hello World")
	}

	t.Run("getRaw_uses_cache", func(t *testing.T) {
		// Modify file on disk.
		if err := os.WriteFile(full, []byte("modified content"), 0644); err != nil {
			t.Fatal(err)
		}
		// Cache should still return original content.
		content, err := cache.getRaw(root, rel)
		if err != nil {
			t.Fatal(err)
		}
		if content != "Hello World" {
			t.Errorf("expected cached %q, got %q", "Hello World", content)
		}
	})
}

func TestPrefilterContent(t *testing.T) {
	t.Run("small_content_unchanged", func(t *testing.T) {
		content := strings.Repeat("line\n", 50)
		got := prefilterContent(content, []string{"keyword"}, 3)
		if got == nil || len(got.Lines) != 50 {
			t.Errorf("small content should preserve all 50 lines, got %d", len(got.Lines))
		}
	})

	t.Run("large_content_with_keywords", func(t *testing.T) {
		var lines []string
		for i := 0; i < 200; i++ {
			lines = append(lines, fmt.Sprintf("line %d", i+1))
		}
		// Insert a keyword hit at line 50
		lines[49] = "SPECIAL_MARKER_HERE"
		content := strings.Join(lines, "\n")

		got := prefilterContent(content, []string{"SPECIAL_MARKER_HERE"}, 5)
		if len(got.Lines) == 200 {
			t.Fatal("content should have been filtered")
		}
		text := got.ToText()
		if !strings.Contains(text, "SPECIAL_MARKER_HERE") {
			t.Errorf("filtered result should contain keyword line")
		}
		if !strings.Contains(text, "45:") || !strings.Contains(text, "55:") {
			t.Errorf("expected context lines (45-55), got: %s", text)
		}
	})

	t.Run("hit_over_80_percent_returns_original", func(t *testing.T) {
		var lines []string
		for i := 0; i < 200; i++ {
			lines = append(lines, fmt.Sprintf("hit line %d", i+1))
		}
		content := strings.Join(lines, "\n")
		// "hit" appears on every line, so 100% hit rate > 80% → return original
		got := prefilterContent(content, []string{"hit"}, 10)
		if len(got.Lines) != 200 {
			t.Errorf("expected original 200 lines when >80%% hits, got %d", len(got.Lines))
		}
	})

	t.Run("no_match_returns_empty", func(t *testing.T) {
		var lines []string
		for i := 0; i < 200; i++ {
			lines = append(lines, "line")
		}
		content := strings.Join(lines, "\n")
		got := prefilterContent(content, []string{"nonexistent"}, 5)
		if len(got.Lines) != 0 {
			t.Errorf("expected empty for no matches, got: %s", got.ToText())
		}
	})

	t.Run("empty_content", func(t *testing.T) {
		got := prefilterContent("", []string{"keyword"}, 3)
		if got == nil || len(got.Lines) != 0 {
			t.Errorf("expected empty, got %v", got)
		}
	})

	t.Run("preserves_original_line_numbers", func(t *testing.T) {
		var lines []string
		for i := 0; i < 200; i++ {
			lines = append(lines, fmt.Sprintf("line %d", i+1))
		}
		lines[149] = "TARGET_HIT"
		content := strings.Join(lines, "\n")

		got := prefilterContent(content, []string{"TARGET_HIT"}, 2)
		has150 := false
		for _, l := range got.Lines {
			if l.OriginalLine == 150 {
				has150 = true
			}
		}
		if !has150 {
			t.Errorf("expected original line 150 in filtered result")
		}
	})
}

func TestRecallCandidates_FulltextHitCap(t *testing.T) {
	root := t.TempDir()
	// Create a doc where every line matches keywords → fulltextHits would be very high
	var lines []string
	for i := 0; i < 50; i++ {
		lines = append(lines, "bingo word here")
	}
	docs := map[string]string{
		"high_hit.md":  strings.Join(lines, "\n"),
		"single_hit.md": "only one bingo word",
		"no_hit.md":    "nothing matches",
	}
	tags := map[string][]string{
		"high_hit.md":  {},
		"single_hit.md": {},
		"no_hit.md":    {},
	}
	writeFixture(t, root, docs, tags)
	metas, _ := meta.ScanAll(root, "")

	got := recallCandidates(metas, newContentCache(), root, nil, []string{"bingo"})
	if len(got) == 0 {
		t.Fatal("expected candidates")
	}

	// Find high_hit.md and verify its score uses the retrieval content cap (20),
	// not the raw fulltext hit count.
	for _, c := range got {
		if c.relPath == "high_hit.md" {
			// Without the cap, fulltextHits would be 50 and score would be 50.
			// With the cap, score should be exactly 20.
			if c.score != 20 {
				t.Errorf("high_hit.md score = %d, want 20", c.score)
			}
		}
	}
}

func TestParseLocationLines(t *testing.T) {
	cases := []struct {
		input     string
		wantStart int
		wantEnd   int
	}{
		{"#10-20", 10, 20},
		{"10-20", 10, 20},
		{"#1-3", 1, 3},
		{"", 0, 0},
		{"#", 0, 0},
		{"#10", 0, 0},
		{"#abc-def", 0, 0},
		{"##10-20", 0, 0},
	}
	for _, c := range cases {
		start, end := parseLocationLines(c.input)
		if start != c.wantStart || end != c.wantEnd {
			t.Errorf("parseLocationLines(%q) = (%d, %d), want (%d, %d)",
				c.input, start, end, c.wantStart, c.wantEnd)
		}
	}
}

// writeFixture lays out a minimal knowledge base under root with the given
// docs (relPath -> content) and meta entries. tags map docPath -> []string.
func writeFixture(t *testing.T, root string, docs map[string]string, tags map[string][]string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(root, ".mindstack"), 0755); err != nil {
		t.Fatal(err)
	}
	store := map[string]*meta.DocumentMeta{}
	for rel, content := range docs {
		full := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
		store[rel] = &meta.DocumentMeta{
			Title:   rel,
			Summary: "fixture",
			Tags:    tags[rel],
			Status:  "active",
		}
	}
	data, _ := json.MarshalIndent(store, "", "  ")
	if err := os.WriteFile(filepath.Join(root, ".mindstack", "meta.json"), data, 0644); err != nil {
		t.Fatal(err)
	}
}

func TestRecallCandidates_TagAndFulltext(t *testing.T) {
	root := t.TempDir()
	docs := map[string]string{
		"api.md":    "# API\nretry policy section here\nuse exponential backoff",
		"design.md": "# Design\nno match",
		"other.md":  "unrelated content",
	}
	tags := map[string][]string{
		"api.md":    {"api", "rest"},
		"design.md": {"design"},
		"other.md":  {"misc"},
	}
	writeFixture(t, root, docs, tags)

	metas, err := meta.ScanAll(root, "")
	if err != nil {
		t.Fatal(err)
	}

	got := recallCandidates(metas, newContentCache(), root, []string{"api"}, []string{"retry", "policy"})
	if len(got) == 0 {
		t.Fatal("expected at least one candidate")
	}
	if got[0].relPath != "api.md" {
		t.Errorf("expected api.md first, got %q", got[0].relPath)
	}
	for _, c := range got {
		if c.relPath == "other.md" {
			t.Errorf("other.md should not be recalled, score=%d", c.score)
		}
	}
}

func TestRecallCandidates_TitleAndSummary(t *testing.T) {
	root := t.TempDir()
	docs := map[string]string{
		"a.md": "content a",
		"b.md": "content b",
	}
	// Write fixture with custom meta to set title/summary.
	if err := os.MkdirAll(filepath.Join(root, ".mindstack"), 0755); err != nil {
		t.Fatal(err)
	}
	store := map[string]*meta.DocumentMeta{
		"a.md": {Title: "Retry Policy Guide", Summary: "how to retry failed requests", Tags: []string{}, Status: "active"},
		"b.md": {Title: "Cooking Basics", Summary: "how to cook pasta", Tags: []string{}, Status: "active"},
	}
	for rel := range docs {
		full := filepath.Join(root, rel)
		if err := os.WriteFile(full, []byte(docs[rel]), 0644); err != nil {
			t.Fatal(err)
		}
	}
	data, _ := json.MarshalIndent(store, "", "  ")
	if err := os.WriteFile(filepath.Join(root, ".mindstack", "meta.json"), data, 0644); err != nil {
		t.Fatal(err)
	}

	metas, _ := meta.ScanAll(root, "")
	got := recallCandidates(metas, newContentCache(), root, nil, []string{"retry"})
	if len(got) == 0 {
		t.Fatal("expected a.md via title/summary match")
	}
	if got[0].relPath != "a.md" {
		t.Errorf("expected a.md first, got %q", got[0].relPath)
	}
	if got[0].titleHits == 0 && got[0].summaryHits == 0 {
		t.Errorf("expected titleHits or summaryHits > 0")
	}
}

func TestRecallCandidates_TopRecallCap(t *testing.T) {
	root := t.TempDir()
	docs := map[string]string{}
	tags := map[string][]string{}
	for i := 0; i < topRecall+5; i++ {
		name := fmt.Sprintf("doc%d.md", i)
		docs[name] = "matched content here"
		tags[name] = []string{"api"}
	}
	writeFixture(t, root, docs, tags)
	metas, _ := meta.ScanAll(root, "")
	got := recallCandidates(metas, newContentCache(), root, []string{"api"}, []string{"matched"})
	if len(got) > topRecall {
		t.Errorf("expected cap at %d, got %d", topRecall, len(got))
	}
}

func toFilteredContent(content string) *retrieval.FilteredContent {
	lines := splitLines(content)
	fc := &retrieval.FilteredContent{Lines: make([]retrieval.NumberedLine, len(lines))}
	for i, line := range lines {
		fc.Lines[i] = retrieval.NumberedLine{OriginalLine: i + 1, Text: line}
	}
	return fc
}

func TestExtractSnippetsLocal(t *testing.T) {
	root := t.TempDir()
	content := "line 1\nline 2\nretry policy here\nline 4\nline 5\nuse exponential backoff\nline 7\nline 8\nline 9"
	fc := toFilteredContent(content)
	snippets := extractSnippetsLocal([]string{"retry"}, root, "test.md", fc, 0.9)
	if len(snippets) == 0 {
		t.Fatal("expected at least one snippet")
	}
	sn := snippets[0]
	if !strings.Contains(sn.Content, "retry policy") {
		t.Errorf("snippet should contain 'retry policy', got %q", sn.Content)
	}
	if sn.Score != 0.9 {
		t.Errorf("score = %f, want 0.9", sn.Score)
	}
	// Verify context lines are included.
	if !strings.Contains(sn.Content, "line 2") {
		t.Errorf("snippet missing upper context")
	}
	// Location should use the absolute path and refer to original line numbers.
	wantLocation := filepath.Join(root, "test.md") + "#1-5"
	if sn.Location != wantLocation {
		t.Errorf("expected location %q, got %q", wantLocation, sn.Location)
	}
}

func TestExtractSnippetsLocal_NoMatch(t *testing.T) {
	root := t.TempDir()
	fc := toFilteredContent("foo bar baz")
	snippets := extractSnippetsLocal([]string{"nonexistent"}, root, "test.md", fc, 0.5)
	if len(snippets) != 0 {
		t.Errorf("expected 0 snippets, got %d", len(snippets))
	}
}

func TestExtractSnippetsLocal_CapPerDoc(t *testing.T) {
	root := t.TempDir()
	// Create content with many scattered hits to test maxSnippetsPerDoc cap.
	var lines []string
	for i := 0; i < 50; i++ {
		if i%10 == 0 {
			lines = append(lines, "retry policy here")
		} else {
			lines = append(lines, "filler line")
		}
	}
	fc := toFilteredContent(strings.Join(lines, "\n"))
	snippets := extractSnippetsLocal([]string{"retry"}, root, "test.md", fc, 0.8)
	if len(snippets) > maxSnippetsPerDoc {
		t.Errorf("expected at most %d snippets, got %d", maxSnippetsPerDoc, len(snippets))
	}
}

func TestExtractSnippetsLocal_LongDocumentOriginalLineNumbers(t *testing.T) {
	root := t.TempDir()
	var lines []string
	for i := 0; i < 200; i++ {
		lines = append(lines, fmt.Sprintf("line %d", i+1))
	}
	lines[149] = "retry policy target"
	fc := prefilterContent(strings.Join(lines, "\n"), []string{"retry"}, 2)
	snippets := extractSnippetsLocal([]string{"retry"}, root, "test.md", fc, 1.0)
	if len(snippets) == 0 {
		t.Fatal("expected snippet")
	}
	wantPrefix := filepath.Join(root, "test.md") + "#148-"
	if !strings.HasPrefix(snippets[0].Location, wantPrefix) {
		t.Errorf("expected location with prefix %q, got %q", wantPrefix, snippets[0].Location)
	}
}

func TestExtractSnippetsLLM(t *testing.T) {
	root := t.TempDir()
	content := "line 1\nline 2\nline 3\nline 4\nline 5\n"
	fc := toFilteredContent(content)
	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "相关", body: `[{"location":"#2-4","score":0.9}]`},
		},
	}
	snippets := extractSnippetsLLM(context.Background(), llm, "test query", root, "test.md", fc, "zh", 3)
	if len(snippets) != 1 {
		t.Fatalf("expected 1 snippet, got %d", len(snippets))
	}
	sn := snippets[0]
	wantLocation := filepath.Join(root, "test.md") + "#2-4"
	if sn.Location != wantLocation {
		t.Errorf("Location = %q, want %q", sn.Location, wantLocation)
	}
	if sn.Score != 0.9 {
		t.Errorf("Score = %f, want 0.9", sn.Score)
	}
	if !strings.Contains(sn.Content, "line 2") || !strings.Contains(sn.Content, "line 3") || !strings.Contains(sn.Content, "line 4") {
		t.Errorf("Content = %q, want lines 2-4", sn.Content)
	}
}

func TestExtractSnippetsLLM_FallbackOnLLMError(t *testing.T) {
	root := t.TempDir()
	fc := toFilteredContent("line 1\nline 2\nline 3\n")
	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "相关", body: "not json"},
		},
	}
	snippets := extractSnippetsLLM(context.Background(), llm, "test query", root, "test.md", fc, "zh", 3)
	if snippets != nil {
		t.Errorf("expected nil on invalid JSON, got %v", snippets)
	}
}

func TestExtractSnippetsLLM_LongDocumentOriginalLineNumbers(t *testing.T) {
	root := t.TempDir()
	var lines []string
	for i := 0; i < 200; i++ {
		lines = append(lines, fmt.Sprintf("line %d", i+1))
	}
	lines[149] = "retry policy target"
	fc := prefilterContent(strings.Join(lines, "\n"), []string{"retry"}, 2)
	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "相关", body: `[{"location":"#148-152","score":0.9}]`},
		},
	}
	snippets := extractSnippetsLLM(context.Background(), llm, "retry policy", root, "test.md", fc, "zh", 3)
	if len(snippets) == 0 {
		t.Fatal("expected snippet")
	}
	wantPrefix := filepath.Join(root, "test.md") + "#148-"
	if !strings.HasPrefix(snippets[0].Location, wantPrefix) {
		t.Errorf("expected location with prefix %q, got %q", wantPrefix, snippets[0].Location)
	}
}

func TestRerankCandidates(t *testing.T) {
	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "候选文档", body: `[{"path":"b.md","score":0.9},{"path":"a.md","score":0.7}]`},
		},
	}
	previews := []string{"path: a.md\n标题: A", "path: b.md\n标题: B"}
	got := rerankCandidates(context.Background(), llm, "test", previews, "zh", 2)
	if len(got) != 2 {
		t.Fatalf("expected 2 items, got %d", len(got))
	}
	if got[0].Path != "b.md" {
		t.Errorf("expected b.md first, got %q", got[0].Path)
	}
	if got[0].Score != 0.9 {
		t.Errorf("score = %f, want 0.9", got[0].Score)
	}
}

func TestRerankCandidates_EmptyPreviews(t *testing.T) {
	llm := &fakeLLM{}
	got := rerankCandidates(context.Background(), llm, "test", nil, "zh", 2)
	if len(got) != 0 {
		t.Errorf("expected empty, got %d", len(got))
	}
}

func TestAck_FullPipeline(t *testing.T) {
	root := t.TempDir()
	apiContent := "# API Guide\n\nRetry uses exponential backoff.\nDefault 3 attempts.\nTimeout 30s.\n"
	docs := map[string]string{
		"api.md":       apiContent,
		"unrelated.md": "this document is about cooking recipes",
	}
	tags := map[string][]string{
		"api.md":       {"api", "retry"},
		"unrelated.md": {"food", "api"},
	}
	writeFixture(t, root, docs, tags)

	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "可用的标签", body: `["api","retry"]`},
			{match: "英文关键词", body: `["retry","policy","exponential","backoff"]`},
			{match: "候选文档", body: `[{"path":"api.md","score":0.95}]`},
			{match: "提取", body: `[{"location":"#3-5","score":0.95}]`},
			{match: "证据片段", body: "Use exponential backoff with up to 3 attempts and a 30s timeout."},
		},
	}

	res, err := Ack(context.Background(), llm, root, "what is the retry policy", "zh")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Snippets) == 0 {
		t.Fatal("expected snippets, got none")
	}
	sn := res.Snippets[0]
	wantLocation := filepath.Join(root, "api.md") + "#3-5"
	if sn.Location != wantLocation {
		t.Errorf("Location = %q, want %q", sn.Location, wantLocation)
	}
	if !strings.Contains(sn.Content, "exponential backoff") {
		t.Errorf("content missing expected line: %q", sn.Content)
	}
	if !strings.Contains(res.Summary, "exponential backoff") {
		t.Errorf("summary = %q, want it to mention exponential backoff", res.Summary)
	}
	if len(res.Tags) < 1 {
		t.Errorf("tags = %v, want at least 1", res.Tags)
	}
	// Verify LLM call count: tag + keyword + rerank + extract + summary = 5.
	if llm.calls != 5 {
		t.Errorf("expected 5 LLM calls, got %d", llm.calls)
	}
}

func TestAck_MaliciousRerankPathIgnored(t *testing.T) {
	root := t.TempDir()
	// Place a decoy file outside the KB root; a malicious LLM rerank response
	// might point here, but it is not in the candidate set and must be ignored.
	parentDir := filepath.Dir(root)
	secretPath := filepath.Join(parentDir, "secret.md")
	if err := os.WriteFile(secretPath, []byte("SECRET CONTENT"), 0644); err != nil {
		t.Fatal(err)
	}

	writeFixture(t, root, map[string]string{
		"a.md": "legitimate content",
	}, map[string][]string{
		"a.md": {"foo"},
	})

	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "可用的标签", body: `["foo"]`},
			{match: "英文关键词", body: `["legitimate"]`},
			// LLM attempts to rerank a path outside the recall candidate set.
			{match: "候选文档", body: `[{"path":"../secret.md","score":0.99}]`},
			{match: "提取", body: `[{"location":"#1-1","score":0.99}]`},
			{match: "证据片段", body: "SECRET CONTENT"},
		},
	}

	res, err := Ack(context.Background(), llm, root, "legitimate", "zh")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Snippets) != 0 {
		t.Fatalf("expected 0 snippets for malicious rerank path, got %d: %v", len(res.Snippets), res.Snippets)
	}
	if strings.Contains(res.Summary, "SECRET") {
		t.Errorf("summary should not contain content from outside the KB")
	}
}

func TestAck_NoCandidates(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, map[string]string{
		"a.md": "totally different topic",
	}, map[string][]string{
		"a.md": {"foo"},
	})

	llm := &fakeLLM{responses: []fakeResp{
		{match: "可用的标签", body: `[]`},
		{match: "关键词", body: `["nothing","matches"]`},
	}}
	res, err := Ack(context.Background(), llm, root, "nothing matches", "zh")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Snippets) != 0 {
		t.Errorf("expected 0 snippets, got %d", len(res.Snippets))
	}
}

func TestAck_EmptyQuery(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, map[string]string{}, map[string][]string{})
	if _, err := Ack(context.Background(), &fakeLLM{}, root, "  ", "zh"); err == nil {
		t.Error("expected error for empty query")
	}
}

func TestMakeDocPreview(t *testing.T) {
	root := t.TempDir()
	rel := "doc.md"
	full := filepath.Join(root, rel)

	// Create content with more than previewMaxLines lines.
	var lines []string
	for i := 0; i < 55; i++ {
		lines = append(lines, fmt.Sprintf("line %d", i+1))
	}
	content := strings.Join(lines, "\n")
	if err := os.WriteFile(full, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	m := &meta.DocumentMeta{
		Title:   "Test Title",
		Tags:    []string{"tag1", "tag2"},
		Summary: "This is a summary.",
	}

	preview, err := makeDocPreview(root, rel, m, "zh", newContentCache(), nil)
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(preview, "路径:") {
		t.Errorf("missing Chinese label 路径")
	}
	if !strings.Contains(preview, "标题:") {
		t.Errorf("missing Chinese label 标题")
	}
	if !strings.Contains(preview, "标签:") {
		t.Errorf("missing Chinese label 标签")
	}
	if !strings.Contains(preview, "摘要:") {
		t.Errorf("missing Chinese label 摘要")
	}
	if !strings.Contains(preview, "正文前") {
		t.Errorf("missing Chinese body preview label")
	}
	if !strings.Contains(preview, "Test Title") {
		t.Errorf("missing title content")
	}
	if !strings.Contains(preview, "tag1, tag2") {
		t.Errorf("missing tags content")
	}
	if !strings.Contains(preview, "This is a summary.") {
		t.Errorf("missing summary content")
	}
	if !strings.Contains(preview, "... [truncated]") {
		t.Errorf("missing truncated marker")
	}

	// Verify only first previewMaxLines lines are shown.
	lineCount := strings.Count(preview, "\n")
	// Preview header has 5 lines (路径, 标题, 标签, 摘要, 正文前) + previewMaxLines body lines + truncated line.
	expectedLines := 5 + previewMaxLines + 1
	if lineCount != expectedLines {
		t.Errorf("expected %d lines in preview, got %d", expectedLines, lineCount)
	}
}

func TestMakeDocPreview_English(t *testing.T) {
	root := t.TempDir()
	rel := "doc.md"
	full := filepath.Join(root, rel)

	// Create content with more than previewMaxLines lines.
	var lines []string
	for i := 0; i < 55; i++ {
		lines = append(lines, fmt.Sprintf("line %d", i+1))
	}
	content := strings.Join(lines, "\n")
	if err := os.WriteFile(full, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	m := &meta.DocumentMeta{
		Title:   "Test Title",
		Tags:    []string{"tag1", "tag2"},
		Summary: "This is a summary.",
	}

	preview, err := makeDocPreview(root, rel, m, "en", newContentCache(), nil)
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(preview, "Path:") {
		t.Errorf("missing English label Path")
	}
	if !strings.Contains(preview, "Title:") {
		t.Errorf("missing English label Title")
	}
	if !strings.Contains(preview, "Tags:") {
		t.Errorf("missing English label Tags")
	}
	if !strings.Contains(preview, "Summary:") {
		t.Errorf("missing English label Summary")
	}
	if !strings.Contains(preview, "First") {
		t.Errorf("missing English body preview label")
	}
	if !strings.Contains(preview, "Test Title") {
		t.Errorf("missing title content")
	}
	if !strings.Contains(preview, "tag1, tag2") {
		t.Errorf("missing tags content")
	}
	if !strings.Contains(preview, "This is a summary.") {
		t.Errorf("missing summary content")
	}
	if !strings.Contains(preview, "... [truncated]") {
		t.Errorf("missing truncated marker")
	}
}

func TestMakeDocPreview_MatchedExcerpts(t *testing.T) {
	root := t.TempDir()
	rel := "doc.md"
	full := filepath.Join(root, rel)

	var lines []string
	for i := 0; i < 120; i++ {
		lines = append(lines, fmt.Sprintf("line %d", i+1))
	}
	lines[99] = "retry policy uses exponential backoff"
	content := strings.Join(lines, "\n")
	if err := os.WriteFile(full, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	m := &meta.DocumentMeta{Title: "API Guide"}
	matches := []retrieval.LineMatch{
		{Line: 100, Text: lines[99], Source: retrieval.SourceContent},
	}
	preview, err := makeDocPreview(root, rel, m, "en", newContentCache(), matches)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(preview, "Matched excerpts") {
		t.Errorf("expected Matched excerpts section")
	}
	if !strings.Contains(preview, "100: retry policy uses exponential backoff") {
		t.Errorf("expected matched line 100 in preview, got:\n%s", preview)
	}
}

func TestAck_TagExtractionFailureFallsBackToFulltext(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, map[string]string{
		"a.md": "the magic phrase appears here",
	}, map[string][]string{
		"a.md": {"foo"},
	})

	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "可用的标签", body: "not json"},
			{match: "候选文档", body: `[{"path":"a.md","score":0.8}]`},
			{match: "证据片段", body: "The magic phrase appears in a.md."},
		},
	}
	res, err := Ack(context.Background(), llm, root, "magic phrase", "zh")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Snippets) == 0 {
		t.Fatalf("expected snippets from fulltext fallback, got none")
	}
	if len(res.Tags) != 0 {
		t.Errorf("expected empty tags after extraction failure, got %v", res.Tags)
	}
	if res.Summary == "" {
		t.Errorf("expected non-empty summary, got empty")
	}
}
