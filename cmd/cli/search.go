package main

import (
	"fmt"
	"strings"

	"mindstack/internal/meta"
	"mindstack/internal/retrieval"

	"github.com/spf13/cobra"
)

var (
	searchFulltext bool
	searchMode     string
)

var searchCmd = &cobra.Command{
	Use:   "search <query>",
	Short: "Search documents by tag, full text, or hybrid mode",
	Long: `Search documents by tag, full text, or hybrid mode.

Tag search (default):
  mindstack search <tag>
  mindstack search <tag1>,<tag2>     -- AND semantics
  mindstack search "tag1 , tag2"     -- spaces are trimmed

Full text search:
  mindstack search --mode fulltext <keyword>
  mindstack search --fulltext <keyword>   -- deprecated alias for --mode fulltext

Hybrid search (recommended for AI codegen tools):
  mindstack search --mode hybrid <query>`,
	Args: cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		root := requireRoot()

		if cmd.Flag("mode").Changed {
			switch searchMode {
			case string(retrieval.ModeTag), "t",
				string(retrieval.ModeFulltext), "ft",
				string(retrieval.ModeHybrid), "h":
				// ok
			default:
				writeError(1, "SEARCH_FAILED", fmt.Sprintf("invalid mode: %s", searchMode))
				return
			}
		}

		mode := resolveSearchMode()
		query := args[0]

		vocab := buildTagVocab(root)
		opts := retrieval.Options{
			Mode:    mode,
			Subdir:  "",
			TagMode: retrieval.TagModeOR,
		}

		var q retrieval.Query
		switch mode {
		case retrieval.ModeTag:
			opts.TagMode = retrieval.TagModeAND
			q = retrieval.Query{Raw: query, Tags: retrieval.NormalizeTagQuery(query)}
		case retrieval.ModeFulltext:
			q = retrieval.Query{Raw: query, Terms: retrieval.NormalizeFulltextQuery(query)}
		case retrieval.ModeHybrid:
			q = retrieval.BuildQuery(query, vocab)
		}

		rs, err := retrieval.Search(root, q, opts)
		if err != nil {
			writeError(1, "SEARCH_FAILED", err.Error())
			return
		}

		saveToHistory(root, query, rs)
		writeJSON(rs)
	},
}

func resolveSearchMode() retrieval.Mode {
	if searchFulltext {
		return retrieval.ModeFulltext
	}

	switch searchMode {
	case string(retrieval.ModeTag), "t":
		return retrieval.ModeTag
	case string(retrieval.ModeFulltext), "ft":
		return retrieval.ModeFulltext
	case string(retrieval.ModeHybrid), "h":
		return retrieval.ModeHybrid
	case "":
		return retrieval.ModeTag
	default:
		return retrieval.ModeTag
	}
}

func init() {
	searchCmd.Flags().BoolVar(&searchFulltext, "fulltext", false, "search by full text instead of tag (deprecated, use --mode fulltext)")
	searchCmd.Flags().StringVar(&searchMode, "mode", "", "search mode: tag, fulltext, hybrid")
	searchCmd.MarkFlagsMutuallyExclusive("fulltext", "mode")
}

// buildTagVocab loads all tags from the knowledge base metadata.
func buildTagVocab(kbRoot string) map[string]struct{} {
	metas, err := meta.ScanAll(kbRoot, "")
	if err != nil {
		return nil
	}
	vocab := make(map[string]struct{})
	for _, m := range metas {
		for _, t := range m.Tags {
			t = strings.ToLower(strings.TrimSpace(t))
			if t != "" {
				vocab[t] = struct{}{}
			}
		}
	}
	return vocab
}
