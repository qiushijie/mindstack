package ack

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mindstack/internal/meta"

	einoschema "github.com/cloudwego/eino/schema"
)

// fakeLLM is a programmable LLMClient that returns canned responses keyed on
// substring of the incoming prompt. Lookups use the first matching key.
type fakeLLM struct {
	responses []fakeResp
	calls     int
}

type fakeResp struct {
	match string
	body  string
	err   error
}

func (f *fakeLLM) Chat(_ context.Context, messages []*einoschema.Message) (string, error) {
	f.calls++
	prompt := ""
	if len(messages) > 0 {
		prompt = messages[0].Content
	}
	for _, r := range f.responses {
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
		start, end, total int
		wantStart, wantEnd int
		wantOK            bool
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

	got := recallCandidates(metas, root, []string{"api"}, "retry policy")
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

func TestRecallCandidates_TopRecallCap(t *testing.T) {
	root := t.TempDir()
	docs := map[string]string{}
	tags := map[string][]string{}
	for i := 0; i < topRecall+5; i++ {
		name := strings.ReplaceAll(strings.ReplaceAll("doc-A.md", "A", string(rune('a'+i))), "doc-", "doc")
		docs[name] = "matched content here"
		tags[name] = []string{"api"}
	}
	writeFixture(t, root, docs, tags)
	metas, _ := meta.ScanAll(root, "")
	got := recallCandidates(metas, root, []string{"api"}, "matched")
	if len(got) > topRecall {
		t.Errorf("expected cap at %d, got %d", topRecall, len(got))
	}
}

func TestAck_FullPipeline(t *testing.T) {
	root := t.TempDir()
	apiContent := "# API Guide\n\nRetry uses exponential backoff.\nDefault 3 attempts.\nTimeout 30s.\n"
	docs := map[string]string{
		"api.md":     apiContent,
		"unrelated.md": "this document is about cooking recipes",
	}
	tags := map[string][]string{
		"api.md":       {"api", "retry"},
		"unrelated.md": {"food"},
	}
	writeFixture(t, root, docs, tags)

	llm := &fakeLLM{
		responses: []fakeResp{
			{match: "可用的标签", body: `["api","retry"]`},
			{match: "提取证据", body: `{"snippets":[{"start":3,"end":5,"score":0.9}]}`},
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
	if sn.StartLine != 3 || sn.EndLine != 5 {
		t.Errorf("range = %d-%d, want 3-5", sn.StartLine, sn.EndLine)
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
			{match: "提取证据", body: `{"snippets":[{"start":1,"end":1,"score":0.5}]}`},
			{match: "证据片段", body: "The magic phrase appears in a.md."},
		},
	}
	res, err := Ack(context.Background(), llm, root, "magic phrase", "zh")
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Snippets) != 1 {
		t.Fatalf("expected 1 snippet from fulltext fallback, got %d", len(res.Snippets))
	}
	if len(res.Tags) != 0 {
		t.Errorf("expected empty tags after extraction failure, got %v", res.Tags)
	}
	if res.Summary == "" {
		t.Errorf("expected non-empty summary, got empty")
	}
}
