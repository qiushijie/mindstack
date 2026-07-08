package retrieval

import (
	"fmt"
	"strings"
)

// NumberedLine pairs an original markdown line number with its text.
type NumberedLine struct {
	OriginalLine int
	Text         string
}

// FilteredContent holds lines selected from a document while preserving their
// original line numbers.
type FilteredContent struct {
	Lines []NumberedLine
}

// ToText returns the filtered content in a prompt-friendly numbered format.
// Each line is prefixed with its original line number so that LLM responses can
// refer directly to source locations.
func (fc *FilteredContent) ToText() string {
	var sb strings.Builder
	for _, l := range fc.Lines {
		fmt.Fprintf(&sb, "%d: %s\n", l.OriginalLine, l.Text)
	}
	return sb.String()
}
