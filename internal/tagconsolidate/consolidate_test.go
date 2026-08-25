package tagconsolidate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"mindstack/internal/meta"
	"mindstack/internal/relation"
	"mindstack/internal/workspace"

	"github.com/cloudwego/eino/schema"
)

// --- BuildDeterministicPlan tests ---

func TestBuildDeterministicPlan_AutomationFamily(t *testing.T) {
	tags := []TagCount{
		{Tag: "automation", Count: 12},
		{Tag: "Automation", Count: 3},
		{Tag: "AUTOMATION", Count: 1},
		{Tag: "automations", Count: 5},
		{Tag: "Automations", Count: 2},
		{Tag: "automation ", Count: 1},
		{Tag: "automation-engine", Count: 7},
		{Tag: "automation-workflow", Count: 4},
		{Tag: "other-tag", Count: 1},
	}

	plan := BuildDeterministicPlan(tags)

	if plan.Before != 9 {
		t.Fatalf("Before = %d, want 9", plan.Before)
	}
	// automation family merges to 1; engine/workflow/other stay separate.
	if plan.After != 4 {
		t.Fatalf("After = %d, want 4", plan.After)
	}
	if len(plan.Mappings) != 5 {
		t.Fatalf("expected 5 mappings, got %d: %v", len(plan.Mappings), plan.Mappings)
	}

	byFrom := make(map[string]Mapping, len(plan.Mappings))
	for _, m := range plan.Mappings {
		byFrom[m.From] = m
	}

	// Highest document count wins: "automation" (12) is canonical.
	for _, from := range []string{"Automation", "AUTOMATION", "automations", "Automations", "automation "} {
		m, ok := byFrom[from]
		if !ok {
			t.Fatalf("expected mapping from %q", from)
		}
		if m.To != "automation" {
			t.Errorf("mapping from %q: To = %q, want %q", from, m.To, "automation")
		}
	}

	if m := byFrom["Automation"]; m.Reason != "normalization" {
		t.Errorf("Automation reason = %q, want normalization", m.Reason)
	}
	if m := byFrom["automations"]; m.Reason != "plural" {
		t.Errorf("automations reason = %q, want plural", m.Reason)
	}
	if m := byFrom["automations"]; m.Count != 5 {
		t.Errorf("automations count = %d, want 5", m.Count)
	}

	// Distinct GroupKeys must not be merged.
	for _, untouched := range []string{"automation", "automation-engine", "automation-workflow", "other-tag"} {
		if _, ok := byFrom[untouched]; ok {
			t.Errorf("unexpected mapping from %q", untouched)
		}
	}
}

func TestBuildDeterministicPlan_TieBreakPrefersNormalizedForm(t *testing.T) {
	tags := []TagCount{
		{Tag: "Unit Test", Count: 2},
		{Tag: "unit-test", Count: 2},
	}
	plan := BuildDeterministicPlan(tags)
	if len(plan.Mappings) != 1 {
		t.Fatalf("expected 1 mapping, got %d", len(plan.Mappings))
	}
	m := plan.Mappings[0]
	if m.From != "Unit Test" || m.To != "unit-test" {
		t.Fatalf("mapping = %q -> %q, want \"Unit Test\" -> \"unit-test\"", m.From, m.To)
	}
	if m.Reason != "normalization" {
		t.Fatalf("reason = %q, want normalization", m.Reason)
	}
}

func TestBuildDeterministicPlan_Empty(t *testing.T) {
	plan := BuildDeterministicPlan(nil)
	if plan.Before != 0 || plan.After != 0 || len(plan.Mappings) != 0 {
		t.Fatalf("expected empty plan, got %+v", plan)
	}
}

// --- Resolve tests ---

func TestResolve_ChainedMappings(t *testing.T) {
	plan := Plan{Mappings: []Mapping{
		{From: "a", To: "b"},
		{From: "b", To: "c"},
	}}
	if got := Resolve(plan, "a"); got != "c" {
		t.Errorf("Resolve(a) = %q, want %q", got, "c")
	}
	if got := Resolve(plan, "b"); got != "c" {
		t.Errorf("Resolve(b) = %q, want %q", got, "c")
	}
	if got := Resolve(plan, "untouched"); got != "untouched" {
		t.Errorf("Resolve(untouched) = %q, want unchanged", got)
	}
}

func TestResolve_CycleDoesNotHang(t *testing.T) {
	plan := Plan{Mappings: []Mapping{
		{From: "a", To: "b"},
		{From: "b", To: "a"},
		{From: "c", To: "a"},
	}}
	// Mappings on a cycle are dropped entirely: the cycle tags keep their
	// original names instead of being swapped across the knowledge base.
	if got := Resolve(plan, "a"); got != "a" {
		t.Errorf("Resolve(a) = %q, want unchanged (cycle mapping dropped)", got)
	}
	if got := Resolve(plan, "b"); got != "b" {
		t.Errorf("Resolve(b) = %q, want unchanged (cycle mapping dropped)", got)
	}
	// Non-cycle mappings are unaffected, even when they point at a cycle
	// node.
	if got := Resolve(plan, "c"); got != "a" {
		t.Errorf("Resolve(c) = %q, want %q", got, "a")
	}
}

func TestResolve_LongerCycleDropped(t *testing.T) {
	plan := Plan{Mappings: []Mapping{
		{From: "a", To: "b"},
		{From: "b", To: "c"},
		{From: "c", To: "a"},
		{From: "d", To: "e"},
	}}
	for _, tag := range []string{"a", "b", "c"} {
		if got := Resolve(plan, tag); got != tag {
			t.Errorf("Resolve(%q) = %q, want unchanged (cycle mapping dropped)", tag, got)
		}
	}
	if got := Resolve(plan, "d"); got != "e" {
		t.Errorf("Resolve(d) = %q, want %q", got, "e")
	}
}

// --- ApplyPlan tests ---

// setupKB creates a temp knowledge base with meta.json and relations.json.
func setupKB(t *testing.T, metas map[string]interface{}, rels map[string]interface{}) string {
	t.Helper()
	dir := t.TempDir()
	kbDir := filepath.Join(dir, workspace.KnowledgeBaseDir)
	if err := os.MkdirAll(kbDir, 0755); err != nil {
		t.Fatal(err)
	}
	if metas != nil {
		data, _ := json.Marshal(metas)
		if err := os.WriteFile(filepath.Join(kbDir, "meta.json"), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	if rels != nil {
		data, _ := json.Marshal(rels)
		if err := os.WriteFile(filepath.Join(kbDir, "relations.json"), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestApplyPlan_RewritesMetaAndRelations(t *testing.T) {
	dir := setupKB(t,
		map[string]interface{}{
			"a.md": map[string]interface{}{"title": "A", "tags": []string{"Automation", "rest-api", "automations"}},
			"b.md": map[string]interface{}{"title": "B", "tags": []string{"automation"}},
		},
		map[string]interface{}{
			"a.md": []interface{}{
				map[string]interface{}{"source": "a.md", "target": "b.md", "score": 0.8, "sharedTags": []string{"Automation", "rest-api"}},
			},
		},
	)

	plan := Plan{Mappings: []Mapping{
		{From: "Automation", To: "automation", Reason: "normalization"},
		{From: "automations", To: "automation", Reason: "plural"},
	}}

	updated, err := ApplyPlan(dir, plan)
	if err != nil {
		t.Fatalf("ApplyPlan: %v", err)
	}
	// Only a.md changes; b.md is already canonical.
	if updated != 1 {
		t.Fatalf("updated = %d, want 1", updated)
	}

	m, err := meta.LoadMeta(dir, "a.md")
	if err != nil {
		t.Fatalf("load meta a.md: %v", err)
	}
	want := []string{"automation", "rest-api"}
	if len(m.Tags) != len(want) {
		t.Fatalf("a.md tags = %v, want %v", m.Tags, want)
	}
	for i := range want {
		if m.Tags[i] != want[i] {
			t.Fatalf("a.md tags = %v, want %v", m.Tags, want)
		}
	}

	mb, err := meta.LoadMeta(dir, "b.md")
	if err != nil {
		t.Fatalf("load meta b.md: %v", err)
	}
	if len(mb.Tags) != 1 || mb.Tags[0] != "automation" {
		t.Fatalf("b.md tags = %v, want [automation]", mb.Tags)
	}

	store, err := relation.Load(dir)
	if err != nil {
		t.Fatalf("load relations: %v", err)
	}
	shared := store["a.md"][0].SharedTags
	if len(shared) != 2 || shared[0] != "automation" || shared[1] != "rest-api" {
		t.Fatalf("sharedTags = %v, want [automation rest-api]", shared)
	}
}

func TestApplyPlan_ChainedMappings(t *testing.T) {
	dir := setupKB(t,
		map[string]interface{}{
			"a.md": map[string]interface{}{"title": "A", "tags": []string{"old-tag", "mid-tag"}},
		},
		nil,
	)

	plan := Plan{Mappings: []Mapping{
		{From: "old-tag", To: "mid-tag"},
		{From: "mid-tag", To: "new-tag"},
	}}

	updated, err := ApplyPlan(dir, plan)
	if err != nil {
		t.Fatalf("ApplyPlan: %v", err)
	}
	if updated != 1 {
		t.Fatalf("updated = %d, want 1", updated)
	}

	m, err := meta.LoadMeta(dir, "a.md")
	if err != nil {
		t.Fatalf("load meta: %v", err)
	}
	if len(m.Tags) != 1 || m.Tags[0] != "new-tag" {
		t.Fatalf("tags = %v, want [new-tag]", m.Tags)
	}
}

func TestApplyPlan_NormalizesWithoutMappings(t *testing.T) {
	dir := setupKB(t,
		map[string]interface{}{
			"a.md": map[string]interface{}{"title": "A", "tags": []string{"Unit Testing", "unit_testing"}},
		},
		nil,
	)

	updated, err := ApplyPlan(dir, Plan{})
	if err != nil {
		t.Fatalf("ApplyPlan: %v", err)
	}
	if updated != 1 {
		t.Fatalf("updated = %d, want 1", updated)
	}

	m, err := meta.LoadMeta(dir, "a.md")
	if err != nil {
		t.Fatalf("load meta: %v", err)
	}
	if len(m.Tags) != 1 || m.Tags[0] != "unit-testing" {
		t.Fatalf("tags = %v, want [unit-testing]", m.Tags)
	}
}

// --- BuildLLMClusters tests ---

type fakeLLMClient struct {
	response string
	err      error
	gotPrompt string
}

func (f *fakeLLMClient) Chat(ctx context.Context, messages []*schema.Message) (string, error) {
	if len(messages) > 0 {
		f.gotPrompt = messages[len(messages)-1].Content
	}
	if f.err != nil {
		return "", f.err
	}
	return f.response, nil
}

func TestBuildLLMClusters_ParsesMappings(t *testing.T) {
	fake := &fakeLLMClient{
		response: `[{"from":"vue2","to":"vue","reason":"same framework"},{"from":"ghost","to":"vue","reason":"unknown tag"},{"from":"vue","to":"vue","reason":"self"}]`,
	}
	groups := []TagCount{
		{Tag: "vue", Count: 5},
		{Tag: "vue2", Count: 1},
		{Tag: "react", Count: 3},
	}

	plan, err := BuildLLMClusters(context.Background(), fake, groups)
	if err != nil {
		t.Fatalf("BuildLLMClusters: %v", err)
	}

	if plan.Before != 3 || plan.After != 2 {
		t.Fatalf("Before/After = %d/%d, want 3/2", plan.Before, plan.After)
	}
	// Only the valid vue2->vue mapping survives validation.
	if len(plan.Mappings) != 1 {
		t.Fatalf("expected 1 mapping, got %d: %v", len(plan.Mappings), plan.Mappings)
	}
	m := plan.Mappings[0]
	if m.From != "vue2" || m.To != "vue" || m.Count != 1 {
		t.Fatalf("mapping = %+v, want vue2->vue count 1", m)
	}
	// The LLM's reason is preserved for human review.
	if m.Reason != "llm-cluster: same framework" {
		t.Fatalf("reason = %q, want %q", m.Reason, "llm-cluster: same framework")
	}
}

func TestBuildLLMClusters_EmptyReason(t *testing.T) {
	fake := &fakeLLMClient{response: `[{"from":"a","to":"b","reason":""}]`}
	groups := []TagCount{{Tag: "a", Count: 1}, {Tag: "b", Count: 2}}

	plan, err := BuildLLMClusters(context.Background(), fake, groups)
	if err != nil {
		t.Fatalf("BuildLLMClusters: %v", err)
	}
	if len(plan.Mappings) != 1 {
		t.Fatalf("expected 1 mapping, got %d", len(plan.Mappings))
	}
	if plan.Mappings[0].Reason != "llm-cluster" {
		t.Fatalf("reason = %q, want %q", plan.Mappings[0].Reason, "llm-cluster")
	}
}

func TestBuildLLMClusters_BadJSON(t *testing.T) {
	fake := &fakeLLMClient{response: "this is not json"}
	groups := []TagCount{{Tag: "vue", Count: 5}}

	if _, err := BuildLLMClusters(context.Background(), fake, groups); err == nil {
		t.Fatal("expected error for bad JSON")
	}
}

func TestBuildLLMClusters_ChatError(t *testing.T) {
	fake := &fakeLLMClient{err: errors.New("boom")}
	groups := []TagCount{{Tag: "vue", Count: 5}}

	if _, err := BuildLLMClusters(context.Background(), fake, groups); err == nil {
		t.Fatal("expected error from chat failure")
	}
}

func TestBuildLLMClusters_CodeFencedJSON(t *testing.T) {
	fake := &fakeLLMClient{response: "```json\n[{\"from\":\"a\",\"to\":\"b\",\"reason\":\"dup\"}]\n```"}
	groups := []TagCount{{Tag: "a", Count: 1}, {Tag: "b", Count: 2}}

	plan, err := BuildLLMClusters(context.Background(), fake, groups)
	if err != nil {
		t.Fatalf("BuildLLMClusters: %v", err)
	}
	if len(plan.Mappings) != 1 || plan.Mappings[0].From != "a" {
		t.Fatalf("mappings = %v, want a->b", plan.Mappings)
	}
}

func TestBuildLLMClusters_EmptyGroups(t *testing.T) {
	fake := &fakeLLMClient{response: "[]"}
	plan, err := BuildLLMClusters(context.Background(), fake, nil)
	if err != nil {
		t.Fatalf("BuildLLMClusters: %v", err)
	}
	if plan.Before != 0 || plan.After != 0 {
		t.Fatalf("expected empty plan, got %+v", plan)
	}
}

// recordingLLMClient captures the tags listed in each prompt batch.
type recordingLLMClient struct {
	batches [][]string
}

func (r *recordingLLMClient) Chat(ctx context.Context, messages []*schema.Message) (string, error) {
	var batch []string
	for _, line := range strings.Split(messages[len(messages)-1].Content, "\n") {
		// Tag list entries look like "- tag (N docs)".
		if strings.HasPrefix(line, "- ") && strings.HasSuffix(line, "docs)") {
			tag, _, _ := strings.Cut(strings.TrimPrefix(line, "- "), " (")
			batch = append(batch, tag)
		}
	}
	r.batches = append(r.batches, batch)
	return "[]", nil
}

func TestBuildLLMClusters_AlphabeticalBatches(t *testing.T) {
	// More tags than llmBatchSize must be split into alphabetically sorted
	// batches so similarly spelled tags are compared within one call.
	total := llmBatchSize*2 + 5
	groups := make([]TagCount, 0, total)
	for i := total - 1; i >= 0; i-- { // feed in reverse to prove sorting
		groups = append(groups, TagCount{Tag: fmt.Sprintf("tag-%03d", i), Count: 1})
	}

	rec := &recordingLLMClient{}
	if _, err := BuildLLMClusters(context.Background(), rec, groups); err != nil {
		t.Fatalf("BuildLLMClusters: %v", err)
	}

	if len(rec.batches) != 3 {
		t.Fatalf("expected 3 batches, got %d", len(rec.batches))
	}
	for i, want := range []int{llmBatchSize, llmBatchSize, 5} {
		if len(rec.batches[i]) != want {
			t.Fatalf("batch %d size = %d, want %d", i, len(rec.batches[i]), want)
		}
	}
	// Tags must be alphabetical across batch boundaries.
	var flat []string
	for _, b := range rec.batches {
		flat = append(flat, b...)
	}
	for i, tag := range flat {
		want := fmt.Sprintf("tag-%03d", i)
		if tag != want {
			t.Fatalf("flat[%d] = %q, want %q (batches not alphabetical)", i, tag, want)
		}
	}
}
