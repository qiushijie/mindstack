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

func TestClampRange(t *testing.T) {
	cases := []struct {
		start, end, total  int
		wantStart, wantEnd int
		wantOK             bool
	}{
		{1, 5, 10, 1, 5, true},
		{0, 5, 10, 1, 5, true},
		{3, 100, 10, 3, 10, true},
		{5, 3, 10, 0, 0, false},
		{12, 15, 10, 0, 0, false},
		{1, 1, 0, 0, 0, false},
		{1, 1, 1, 1, 1, true},
	}
	for _, c := range cases {
		s, e, ok := clampRange(c.start, c.end, c.total)
		if ok != c.wantOK || s != c.wantStart || e != c.wantEnd {
			t.Errorf("clampRange(%d,%d,%d) = (%d,%d,%v), want (%d,%d,%v)",
				c.start, c.end, c.total, s, e, ok, c.wantStart, c.wantEnd, c.wantOK)
		}
	}
}

func TestCollectAllTags(t *testing.T) {
	metas := []*meta.DocumentMeta{
		{Tags: []string{"api", "rest"}},
		{Tags: []string{"rest", "design"}},
		{Tags: []string{"  ", ""}},
		{Tags: []string{"api"}},
	}
	got := collectAllTags(metas)
	want := []string{"api", "design", "rest"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("[%d] got %q, want %q", i, got[i], want[i])
		}
	}
}

func TestCollectAllTags_WithAliases(t *testing.T) {
	metas := []*meta.DocumentMeta{
		{Tags: []string{"api"}, Aliases: []string{"rest", "  "}},
		{Tags: []string{"design"}, Aliases: []string{"ui"}},
	}
	got := collectAllTags(metas)
	want := []string{"api", "design", "rest", "ui"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range got {
		if got[i] != want[i] {
			t.Errorf("[%d] got %q, want %q", i, got[i], want[i])
		}
	}
}

func TestJoinLines(t *testing.T) {
	lines := []string{"a", "b", "c", "d"}
	if got := joinLines(lines, 2, 3); got != "b\nc" {
		t.Errorf("joinLines 2-3 = %q, want %q", got, "b\nc")
	}
	if got := joinLines(lines, 0, 100); got != "a\nb\nc\nd" {
		t.Errorf("joinLines clamp full = %q", got)
	}
}

// writeFixture lays out a minimal knowledge base under root with the given
// docs (relPath -> content) and meta entries. tags map docPath -> []string.
func writeFixture(t *testing.T, root string, docs map[string]string, tags map[string][]string, aliases map[string][]string) {
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
			Aliases: aliases[rel],
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
	writeFixture(t, root, docs, tags, nil)

	metas, err := meta.ScanAll(root, "")
	if err != nil {
		t.Fatal(err)
	}

	got := recallCandidates(metas, root, []string{"api"}, []string{"retry", "policy"})
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

func TestRecallCandidates_Aliases(t *testing.T) {
	root := t.TempDir()
	docs := map[string]string{
		"a.md": "unit testing guide",
		"b.md": "cooking recipes",
	}
	tags := map[string][]string{
		"a.md": {"unit-test"},
		"b.md": {"food"},
	}
	aliases := map[string][]string{
		"a.md": {"test", "testing"},
	}
	writeFixture(t, root, docs, tags, aliases)

	metas, _ := meta.ScanAll(root, "")
	got := recallCandidates(metas, root, []string{"test"}, nil)
	if len(got) == 0 {
		t.Fatal("expected a.md via alias match")
	}
	if got[0].relPath != "a.md" {
		t.Errorf("expected a.md first, got %q", got[0].relPath)
	}
	if got[0].aliasHits == 0 {
		t.Errorf("expected aliasHits > 0, got %d", got[0].aliasHits)
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
	got := recallCandidates(metas, root, nil, []string{"retry"})
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
		name := strings.ReplaceAll(strings.ReplaceAll("doc-A.md", "A", string(rune('a'+i))), "doc-", "doc")
		docs[name] = "matched content here"
		tags[name] = []string{"api"}
	}
	writeFixture(t, root, docs, tags, nil)
	metas, _ := meta.ScanAll(root, "")
	got := recallCandidates(metas, root, []string{"api"}, []string{"matched"})
	if len(got) > topRecall {
		t.Errorf("expected cap at %d, got %d", topRecall, len(got))
	}
}

func TestExtractSnippetsLocal(t *testing.T) {
	content := "line 1\nline 2\nretry policy here\nline 4\nline 5\nuse exponential backoff\nline 7\nline 8\nline 9"
	snippets := extractSnippetsLocal([]string{"retry"}, "/tmp/test.md", content, 0.9)
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
}

func TestExtractSnippetsLocal_NoMatch(t *testing.T) {
	snippets := extractSnippetsLocal([]string{"nonexistent"}, "/tmp/test.md", "foo bar baz", 0.5)
	if len(snippets) != 0 {
		t.Errorf("expected 0 snippets, got %d", len(snippets))
	}
}

func TestExtractSnippetsLocal_CapPerDoc(t *testing.T) {
	// Create content with many scattered hits to test maxSnippetsPerDoc cap.
	var lines []string
	for i := 0; i < 50; i++ {
		if i%10 == 0 {
			lines = append(lines, "retry policy here")
		} else {
			lines = append(lines, "filler line")
		}
	}
	content := strings.Join(lines, "\n")
	snippets := extractSnippetsLocal([]string{"retry"}, "/tmp/test.md", content, 0.8)
	if len(snippets) > maxSnippetsPerDoc {
		t.Errorf("expected at most %d snippets, got %d", maxSnippetsPerDoc, len(snippets))
	}
}

func TestExtractSnippetsLLM(t *testing.T) {
	content := "line 1\nline 2\nline 3\nline 4\nline 5\n"
	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "相关", body: `[{"startLine":2,"endLine":4,"score":0.9}]`},
		},
	}
	snippets := extractSnippetsLLM(context.Background(), llm, "test query", "/tmp/test.md", content, "zh", 3)
	if len(snippets) != 1 {
		t.Fatalf("expected 1 snippet, got %d", len(snippets))
	}
	sn := snippets[0]
	if sn.Path != "/tmp/test.md" {
		t.Errorf("Path = %q, want %q", sn.Path, "/tmp/test.md")
	}
	if sn.StartLine != 2 {
		t.Errorf("StartLine = %d, want 2", sn.StartLine)
	}
	if sn.EndLine != 4 {
		t.Errorf("EndLine = %d, want 4", sn.EndLine)
	}
	if sn.Score != 0.9 {
		t.Errorf("Score = %f, want 0.9", sn.Score)
	}
	if !strings.Contains(sn.Content, "line 2") || !strings.Contains(sn.Content, "line 3") || !strings.Contains(sn.Content, "line 4") {
		t.Errorf("Content = %q, want lines 2-4", sn.Content)
	}
}

func TestExtractSnippetsLLM_FallbackOnLLMError(t *testing.T) {
	content := "line 1\nline 2\nline 3\n"
	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "相关", body: "not json"},
		},
	}
	snippets := extractSnippetsLLM(context.Background(), llm, "test query", "/tmp/test.md", content, "zh", 3)
	if snippets != nil {
		t.Errorf("expected nil on invalid JSON, got %v", snippets)
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
		"unrelated.md": {"food"},
	}
	writeFixture(t, root, docs, tags, nil)

	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "可用的标签", body: `["api","retry"]`},
			{match: "英文关键词", body: `["retry","policy","exponential","backoff"]`},
			{match: "候选文档", body: `[{"path":"api.md","score":0.95}]`},
			{match: "提取", body: `[{"startLine":3,"endLine":5,"score":0.95}]`},
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
	wantPath := filepath.Join(root, "api.md")
	if sn.Path != wantPath {
		t.Errorf("Path = %q, want %q", sn.Path, wantPath)
	}
	if !strings.Contains(sn.Content, "exponential backoff") {
		t.Errorf("content missing expected line: %q", sn.Content)
	}
	if !strings.Contains(res.Summary, "exponential backoff") {
		t.Errorf("summary = %q, want it to mention exponential backoff", res.Summary)
	}
	if len(res.Tags) != 2 {
		t.Errorf("tags = %v, want 2", res.Tags)
	}
	// Verify LLM call count: tag + keyword + rerank + extract + summary = 5.
	if llm.calls != 5 {
		t.Errorf("expected 5 LLM calls, got %d", llm.calls)
	}
}

func TestAck_NoCandidates(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, map[string]string{
		"a.md": "totally different topic",
	}, map[string][]string{
		"a.md": {"foo"},
	}, nil)

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
	writeFixture(t, root, map[string]string{}, map[string][]string{}, nil)
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
		Aliases: []string{"alias1", "alias2"},
		Summary: "This is a summary.",
	}

	preview, err := makeDocPreview(root, rel, m, "zh")
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
	if !strings.Contains(preview, "别名:") {
		t.Errorf("missing Chinese label 别名")
	}
	if !strings.Contains(preview, "摘要:") {
		t.Errorf("missing Chinese label 摘要")
	}
	if !strings.Contains(preview, "正文预览:") {
		t.Errorf("missing Chinese label 正文预览")
	}
	if !strings.Contains(preview, "Test Title") {
		t.Errorf("missing title content")
	}
	if !strings.Contains(preview, "tag1, tag2") {
		t.Errorf("missing tags content")
	}
	if !strings.Contains(preview, "alias1, alias2") {
		t.Errorf("missing aliases content")
	}
	if !strings.Contains(preview, "This is a summary.") {
		t.Errorf("missing summary content")
	}
	if !strings.Contains(preview, "... [truncated]") {
		t.Errorf("missing truncated marker")
	}

	// Verify only first previewMaxLines lines are shown.
	lineCount := strings.Count(preview, "\n")
	// Preview header has 6 lines (路径, 标题, 标签, 别名, 摘要, 正文预览) + previewMaxLines body lines + truncated line.
	expectedLines := 6 + previewMaxLines + 1
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
		Aliases: []string{"alias1", "alias2"},
		Summary: "This is a summary.",
	}

	preview, err := makeDocPreview(root, rel, m, "en")
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
	if !strings.Contains(preview, "Aliases:") {
		t.Errorf("missing English label Aliases")
	}
	if !strings.Contains(preview, "Summary:") {
		t.Errorf("missing English label Summary")
	}
	if !strings.Contains(preview, "Preview:") {
		t.Errorf("missing English label Preview")
	}
	if !strings.Contains(preview, "Test Title") {
		t.Errorf("missing title content")
	}
	if !strings.Contains(preview, "tag1, tag2") {
		t.Errorf("missing tags content")
	}
	if !strings.Contains(preview, "alias1, alias2") {
		t.Errorf("missing aliases content")
	}
	if !strings.Contains(preview, "This is a summary.") {
		t.Errorf("missing summary content")
	}
	if !strings.Contains(preview, "... [truncated]") {
		t.Errorf("missing truncated marker")
	}
}

func TestAck_TagExtractionFailureFallsBackToFulltext(t *testing.T) {
	root := t.TempDir()
	writeFixture(t, root, map[string]string{
		"a.md": "the magic phrase appears here",
	}, map[string][]string{
		"a.md": {"foo"},
	}, nil)

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
