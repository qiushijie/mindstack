package main

import (
	"fmt"

	"mindstack/internal/chat"
	"mindstack/internal/meta"
	"mindstack/internal/retrieval"

	"github.com/spf13/cobra"
)

var (
	searchFulltext bool
	searchMode     string
	searchLimit    int
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

		metas, err := meta.ScanAll(root, "")
		if err != nil {
			writeError(1, "SEARCH_FAILED", err.Error())
			return
		}
		q, opts := retrieval.BuildQueryForMode(query, mode, retrieval.CollectTagVocab(metas))
		opts.Limit = searchLimit

		rs, err := retrieval.Search(root, q, opts)
		if err != nil {
			writeError(1, "SEARCH_FAILED", err.Error())
			return
		}

		saveToHistory(root, chat.SessionKindSearch(string(mode)), query, rs)
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
	searchCmd.Flags().IntVar(&searchLimit, "limit", 0, "max results to return (0 = unlimited)")
	searchCmd.MarkFlagsMutuallyExclusive("fulltext", "mode")
}
