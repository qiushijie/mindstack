// Package tagconsolidate merges duplicate and near-duplicate tags across a
// knowledge base. It provides a deterministic pass (grouping by
// normalization and plural rules), an optional LLM clustering pass for
// semantic duplicates, and an apply step that rewrites the meta and
// relation stores.
package tagconsolidate

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"mindstack/internal/meta"
	"mindstack/internal/relation"
	"mindstack/internal/tagnorm"

	"github.com/cloudwego/eino/schema"
)

// TagCount pairs a tag with the number of documents using it.
type TagCount struct {
	Tag   string `json:"tag"`
	Count int    `json:"count"`
}

// Mapping renames tag From to tag To. Reason is "normalization", "plural",
// or "llm-cluster: <llm reason>" for LLM-suggested merges.
type Mapping struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Count  int    `json:"count"`
	Reason string `json:"reason"`
}

// Plan describes a tag consolidation: the mappings to apply and the
// distinct tag count before and after.
type Plan struct {
	Mappings []Mapping `json:"mappings"`
	Before   int       `json:"before"`
	After    int       `json:"after"`
}

// BuildDeterministicPlan groups tags by tagnorm.GroupKey. The canonical
// variant is the one with the highest document count (tie: the hyphenated
// lowercase Normalize form). Reason is "normalization" when variants differ
// only by Normalize, "plural" when they differ only by SingularKey.
func BuildDeterministicPlan(tags []TagCount) Plan {
	groups := make(map[string][]TagCount)
	before := 0
	for _, tc := range tags {
		if strings.TrimSpace(tc.Tag) == "" {
			continue
		}
		before++
		key := tagnorm.GroupKey(tc.Tag)
		groups[key] = append(groups[key], tc)
	}

	plan := Plan{Before: before, After: len(groups)}

	keys := make([]string, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, key := range keys {
		variants := groups[key]
		if len(variants) < 2 {
			continue
		}
		canonical := pickCanonical(variants)
		for _, v := range variants {
			if v.Tag == canonical {
				continue
			}
			reason := "plural"
			if tagnorm.Normalize(v.Tag) == tagnorm.Normalize(canonical) {
				reason = "normalization"
			}
			plan.Mappings = append(plan.Mappings, Mapping{
				From:   v.Tag,
				To:     canonical,
				Count:  v.Count,
				Reason: reason,
			})
		}
	}
	return plan
}

// pickCanonical selects the canonical variant of a group: highest document
// count wins; ties prefer the variant already in normalized form, then the
// lexicographically smallest tag.
func pickCanonical(variants []TagCount) string {
	best := variants[0]
	for _, v := range variants[1:] {
		if betterVariant(v, best) {
			best = v
		}
	}
	return best.Tag
}

func betterVariant(a, b TagCount) bool {
	if a.Count != b.Count {
		return a.Count > b.Count
	}
	aNorm := tagnorm.Normalize(a.Tag) == a.Tag
	bNorm := tagnorm.Normalize(b.Tag) == b.Tag
	if aNorm != bNorm {
		return aNorm
	}
	return a.Tag < b.Tag
}

// Resolve applies the plan's mappings, following chained mappings
// (a->b, b->c resolves a->c), and returns the final canonical tag. Tags
// without a mapping are returned unchanged.
func Resolve(plan Plan, tag string) string {
	resolved := resolveMappings(plan.Mappings)
	if to, ok := resolved[tag]; ok {
		return to
	}
	return tag
}

// resolveMappings flattens chained mappings into a direct from->final map.
// Mappings that form a cycle (a->b, b->a) are dropped entirely: tags on a
// cycle have no canonical target, so resolving them would swap tags across
// the whole knowledge base. Non-cycle mappings are unaffected.
func resolveMappings(mappings []Mapping) map[string]string {
	raw := make(map[string]string, len(mappings))
	for _, m := range mappings {
		if m.From != "" && m.To != "" && m.From != m.To {
			raw[m.From] = m.To
		}
	}
	for _, from := range cycleNodes(raw) {
		delete(raw, from)
	}
	resolved := make(map[string]string, len(raw))
	for from := range raw {
		cur := from
		seen := map[string]bool{from: true}
		for {
			next, ok := raw[cur]
			if !ok || seen[next] {
				break
			}
			cur = next
			seen[cur] = true
		}
		if cur != from {
			resolved[from] = cur
		}
	}
	return resolved
}

// cycleNodes returns every node that lies on a cycle in the mapping graph.
func cycleNodes(raw map[string]string) []string {
	cyclic := map[string]bool{}
	for start := range raw {
		var path []string
		index := map[string]int{}
		cur := start
		for {
			if i, ok := index[cur]; ok {
				// Revisited a node on the current path: everything from its
				// first occurrence onward is on a cycle.
				for _, n := range path[i:] {
					if !cyclic[n] {
						cyclic[n] = true
					}
				}
				break
			}
			next, ok := raw[cur]
			if !ok {
				break
			}
			index[cur] = len(path)
			path = append(path, cur)
			cur = next
		}
	}
	out := make([]string, 0, len(cyclic))
	for n := range cyclic {
		out = append(out, n)
	}
	return out
}

// rewriteTags applies resolved mappings, then normalizes and dedupes.
func rewriteTags(tags []string, resolved map[string]string) []string {
	mapped := make([]string, 0, len(tags))
	for _, t := range tags {
		if to, ok := resolved[t]; ok {
			t = to
		}
		mapped = append(mapped, t)
	}
	return tagnorm.NormalizeAll(mapped)
}

func equalStringSlice(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// ApplyPlan rewrites tags in the meta store and sharedTags in relations.
// It returns the number of documents updated.
//
// ApplyPlan fails fast: on error some documents may already be rewritten,
// but every write is a complete meta or relation file, so re-running with
// the same plan is safe (idempotent) and converges to the same result.
func ApplyPlan(kbRoot string, plan Plan) (int, error) {
	resolved := resolveMappings(plan.Mappings)

	metas, err := meta.ScanAll(kbRoot, "")
	if err != nil {
		return 0, fmt.Errorf("scan meta: %w", err)
	}

	updated := 0
	for _, m := range metas {
		rewritten := rewriteTags(m.Tags, resolved)
		if equalStringSlice(rewritten, m.Tags) {
			continue
		}
		m.Tags = rewritten
		if err := meta.SaveMeta(kbRoot, m.Path, m); err != nil {
			return updated, fmt.Errorf("save meta %s (partial apply; safe to re-run the same plan): %w", m.Path, err)
		}
		updated++
	}

	store, err := relation.Load(kbRoot)
	if err != nil {
		return updated, fmt.Errorf("load relations (partial apply; safe to re-run the same plan): %w", err)
	}
	changed := false
	for _, rels := range store {
		for i := range rels {
			rewritten := rewriteTags(rels[i].SharedTags, resolved)
			if !equalStringSlice(rewritten, rels[i].SharedTags) {
				rels[i].SharedTags = rewritten
				changed = true
			}
		}
	}
	if changed {
		if err := relation.Save(kbRoot, store); err != nil {
			return updated, fmt.Errorf("save relations (partial apply; safe to re-run the same plan): %w", err)
		}
	}

	return updated, nil
}

// llmBatchSize caps how many tags are sent to the LLM per clustering call.
const llmBatchSize = 100

// LLMClient abstracts the chat completion call for testability.
type LLMClient interface {
	Chat(ctx context.Context, messages []*schema.Message) (string, error)
}

// BuildLLMClusters sends the canonical groups (with counts) to the LLM in
// batches and asks which tags should merge semantically. The returned plan
// contains additional mappings with Reason "llm-cluster: <llm reason>".
func BuildLLMClusters(ctx context.Context, svc LLMClient, groups []TagCount) (Plan, error) {
	plan := Plan{Before: len(groups), After: len(groups)}
	if len(groups) == 0 {
		return plan, nil
	}

	counts := make(map[string]int, len(groups))
	for _, g := range groups {
		counts[g.Tag] = g.Count
	}

	// Batch alphabetically so similarly spelled tags (the most likely
	// semantic duplicates, e.g. the "automation-*" family) land in the same
	// batch and can actually be compared by the LLM.
	sorted := make([]TagCount, len(groups))
	copy(sorted, groups)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Tag < sorted[j].Tag })

	for start := 0; start < len(sorted); start += llmBatchSize {
		end := min(start+llmBatchSize, len(sorted))
		mappings, err := clusterBatch(ctx, svc, sorted[start:end], counts)
		if err != nil {
			return Plan{}, err
		}
		plan.Mappings = append(plan.Mappings, mappings...)
	}

	// Recompute After over the resolved tag set.
	resolved := resolveMappings(plan.Mappings)
	remaining := make(map[string]bool, len(groups))
	after := 0
	for _, g := range groups {
		t := g.Tag
		if to, ok := resolved[t]; ok {
			t = to
		}
		if !remaining[t] {
			remaining[t] = true
			after++
		}
	}
	plan.After = after
	return plan, nil
}

// clusterBatch runs one LLM clustering call over a batch of canonical tags
// and validates the returned mappings against the known tag set.
func clusterBatch(ctx context.Context, svc LLMClient, batch []TagCount, counts map[string]int) ([]Mapping, error) {
	var sb strings.Builder
	for _, g := range batch {
		fmt.Fprintf(&sb, "- %s (%d docs)\n", g.Tag, g.Count)
	}

	prompt := fmt.Sprintf(`The following tags are used in a knowledge base, with the number of documents using each:

%s
Some of these tags may refer to the same concept. Spelling, casing, and plural variants have already been merged; only report tags that are SEMANTIC duplicates (same concept, different wording).

Respond with ONLY a JSON array (no markdown, no code fences):
[{"from":"tag-to-replace","to":"tag-to-keep","reason":"brief reason"}]

Rules:
- "from" and "to" must be tags copied exactly from the list above
- "to" should be the more common or clearer tag
- Do not report a tag as "from" more than once
- Return [] if no tags should merge`, sb.String())

	messages := []*schema.Message{
		{Role: schema.System, Content: "You consolidate tags in a markdown knowledge base."},
		{Role: schema.User, Content: prompt},
	}

	resp, err := svc.Chat(ctx, messages)
	if err != nil {
		return nil, err
	}

	var raw []struct {
		From   string `json:"from"`
		To     string `json:"to"`
		Reason string `json:"reason"`
	}
	if err := json.Unmarshal([]byte(stripCodeFences(resp)), &raw); err != nil {
		return nil, fmt.Errorf("parse LLM response: %w (raw: %s)", err, resp)
	}

	seenFrom := make(map[string]bool, len(raw))
	var mappings []Mapping
	for _, r := range raw {
		if r.From == "" || r.To == "" || r.From == r.To {
			continue
		}
		if _, ok := counts[r.From]; !ok {
			continue
		}
		if _, ok := counts[r.To]; !ok {
			continue
		}
		if seenFrom[r.From] {
			continue
		}
		seenFrom[r.From] = true
		// Keep the LLM's reason: it is the main evidence a human reviewer
		// has when auditing the merge.
		reason := "llm-cluster"
		if r.Reason != "" {
			reason = "llm-cluster: " + r.Reason
		}
		mappings = append(mappings, Mapping{
			From:   r.From,
			To:     r.To,
			Count:  counts[r.From],
			Reason: reason,
		})
	}
	return mappings, nil
}

// stripCodeFences removes a surrounding markdown code fence from an LLM
// response if present.
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
