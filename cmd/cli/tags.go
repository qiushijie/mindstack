package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	"mindstack/internal/config"
	"mindstack/internal/llm"
	"mindstack/internal/meta"
	"mindstack/internal/tagconsolidate"

	"github.com/spf13/cobra"
)

var tagsCmd = &cobra.Command{
	Use:   "tags",
	Short: "List all tags and their document counts",
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		metas, err := meta.ScanAll(root, "")
		if err != nil {
			writeError(1, "SCAN_FAILED", err.Error())
		}

		tagCount := map[string]int{}
		for _, m := range metas {
			for _, t := range m.Tags {
				tagCount[t]++
			}
		}

		type tagEntry struct {
			Name  string `json:"name"`
			Count int    `json:"count"`
		}

		tags := make([]tagEntry, 0, len(tagCount))
		for name, count := range tagCount {
			tags = append(tags, tagEntry{Name: name, Count: count})
		}
		sort.Slice(tags, func(i, j int) bool {
			if tags[i].Count != tags[j].Count {
				return tags[i].Count > tags[j].Count
			}
			return tags[i].Name < tags[j].Name
		})

		writeJSON(map[string]interface{}{
			"tags":           tags,
			"totalTags":      len(tags),
			"totalDocuments": len(metas),
		})
	},
}

var (
	consolidateApply bool
	consolidateLLM   bool
	consolidateYes   bool
	consolidatePlan  string
)

var tagsConsolidateCmd = &cobra.Command{
	Use:   "consolidate",
	Short: "Consolidate duplicate and near-duplicate tags",
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		// --plan applies a previously reviewed dry-run plan as-is, without
		// re-running the deterministic or LLM passes (which are not
		// guaranteed to produce the same mappings twice).
		if consolidatePlan != "" {
			if !consolidateApply {
				writeError(1, "INVALID_FLAGS", "--plan requires --apply")
			}
			if consolidateLLM {
				writeError(1, "INVALID_FLAGS", "--plan cannot be combined with --llm")
			}
			data, err := os.ReadFile(consolidatePlan)
			if err != nil {
				writeError(1, "PLAN_READ_FAILED", err.Error())
			}
			var plan tagconsolidate.Plan
			if err := json.Unmarshal(data, &plan); err != nil {
				writeError(1, "PLAN_PARSE_FAILED", err.Error())
			}

			// Re-scan the vocabulary and reject stale plans: a reviewed plan
			// is only valid against the exact tag set it was generated from.
			metas, err := meta.ScanAll(root, "")
			if err != nil {
				writeError(1, "SCAN_FAILED", err.Error())
			}
			vocab := countDistinctTags(metas)
			if plan.Before != len(vocab) {
				writeError(1, "PLAN_STALE", fmt.Sprintf(
					"plan expects %d distinct tags but the knowledge base now has %d; the plan is stale, regenerate it with a fresh dry-run",
					plan.Before, len(vocab)))
			}
			for _, m := range plan.Mappings {
				if _, ok := vocab[m.From]; !ok {
					writeError(1, "PLAN_STALE", fmt.Sprintf(
						"tag %q no longer exists in the knowledge base; the plan is stale, regenerate it with a fresh dry-run", m.From))
				}
			}

			updated, err := tagconsolidate.ApplyPlan(root, plan)
			if err != nil {
				writeError(1, "APPLY_FAILED", err.Error())
			}
			writeJSON(map[string]interface{}{
				"applied":     true,
				"mappings":    plan.Mappings,
				"before":      plan.Before,
				"after":       plan.After,
				"docsUpdated": updated,
			})
			return
		}

		metas, err := meta.ScanAll(root, "")
		if err != nil {
			writeError(1, "SCAN_FAILED", err.Error())
		}

		counts := countDistinctTags(metas)
		tagCounts := make([]tagconsolidate.TagCount, 0, len(counts))
		for t, c := range counts {
			tagCounts = append(tagCounts, tagconsolidate.TagCount{Tag: t, Count: c})
		}
		sort.Slice(tagCounts, func(i, j int) bool {
			if tagCounts[i].Count != tagCounts[j].Count {
				return tagCounts[i].Count > tagCounts[j].Count
			}
			return tagCounts[i].Tag < tagCounts[j].Tag
		})

		plan := tagconsolidate.BuildDeterministicPlan(tagCounts)

		if consolidateLLM {
			svc := llm.NewService(config.ResolveConfigPath())
			if err := svc.InitFromConfig(); err != nil {
				writeError(3, "LLM_UNAVAILABLE", fmt.Sprintf("cannot init LLM service: %v", err))
			}

			// Canonical groups after the deterministic pass.
			merged := map[string]int{}
			for _, tc := range tagCounts {
				merged[tagconsolidate.Resolve(plan, tc.Tag)] += tc.Count
			}
			groups := make([]tagconsolidate.TagCount, 0, len(merged))
			for t, c := range merged {
				groups = append(groups, tagconsolidate.TagCount{Tag: t, Count: c})
			}
			sort.Slice(groups, func(i, j int) bool {
				if groups[i].Count != groups[j].Count {
					return groups[i].Count > groups[j].Count
				}
				return groups[i].Tag < groups[j].Tag
			})

			llmPlan, err := tagconsolidate.BuildLLMClusters(context.Background(), svc, groups)
			if err != nil {
				writeError(3, "LLM_UNAVAILABLE", fmt.Sprintf("tag clustering failed: %v", err))
			}
			plan.Mappings = append(plan.Mappings, llmPlan.Mappings...)

			// Recompute the remaining distinct tag count over the merged plan.
			remaining := map[string]bool{}
			after := 0
			for _, tc := range tagCounts {
				t := tagconsolidate.Resolve(plan, tc.Tag)
				if !remaining[t] {
					remaining[t] = true
					after++
				}
			}
			plan.After = after
		}

		// Estimate affected documents: any doc carrying a mapped tag.
		fromSet := make(map[string]bool, len(plan.Mappings))
		for _, m := range plan.Mappings {
			fromSet[m.From] = true
		}
		affected := 0
		for _, m := range metas {
			for _, t := range m.Tags {
				if fromSet[t] {
					affected++
					break
				}
			}
		}

		if !consolidateApply {
			writeJSON(map[string]interface{}{
				"dryRun":       true,
				"mappings":     plan.Mappings,
				"before":       plan.Before,
				"after":        plan.After,
				"affectedDocs": affected,
			})
			return
		}

		if !consolidateYes {
			fmt.Fprintf(stderrWriter, "Consolidation: %d tags -> %d tags, %d mappings, %d documents affected.\n",
				plan.Before, plan.After, len(plan.Mappings), affected)
			fmt.Fprint(stderrWriter, "Apply changes? [y/N] ")
			var input string
			fmt.Scanln(&input)
			if !strings.EqualFold(strings.TrimSpace(input), "y") {
				fmt.Fprintln(stderrWriter, "Aborted.")
				exitFunc(0)
			}
		}

		updated, err := tagconsolidate.ApplyPlan(root, plan)
		if err != nil {
			writeError(1, "APPLY_FAILED", err.Error())
		}

		writeJSON(map[string]interface{}{
			"applied":     true,
			"mappings":    plan.Mappings,
			"before":      plan.Before,
			"after":       plan.After,
			"docsUpdated": updated,
		})
	},
}

func init() {
	tagsConsolidateCmd.Flags().BoolVar(&consolidateApply, "apply", false, "write the consolidation plan to disk (default is a dry-run)")
	tagsConsolidateCmd.Flags().BoolVar(&consolidateLLM, "llm", false, "also run LLM-based semantic clustering")
	tagsConsolidateCmd.Flags().BoolVar(&consolidateYes, "yes", false, "skip the confirmation prompt")
	tagsConsolidateCmd.Flags().StringVar(&consolidatePlan, "plan", "", "apply a previously reviewed dry-run plan JSON file (requires --apply)")
	tagsCmd.AddCommand(tagsConsolidateCmd)
}

// countDistinctTags counts, per distinct non-blank tag, how many documents
// use it (deduplicated within each document).
func countDistinctTags(metas []*meta.DocumentMeta) map[string]int {
	counts := map[string]int{}
	for _, m := range metas {
		seen := make(map[string]bool, len(m.Tags))
		for _, t := range m.Tags {
			t = strings.TrimSpace(t)
			if t != "" && !seen[t] {
				counts[t]++
				seen[t] = true
			}
		}
	}
	return counts
}
