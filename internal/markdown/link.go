package markdown

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
)

// Link represents a link found in a markdown file.
type Link struct {
	Target string `json:"target"`
	Text   string `json:"text"`
	Type   string `json:"type"` // "wiki" or "markdown"
}

var wikiLinkRe = regexp.MustCompile(`\[\[([^\]]+)\]\]`)

// ExtractLinks extracts all links from markdown content.
// Recognizes [[wiki link]] and [text](path.md).
// Ignores external URLs and anchor-only links.
func ExtractLinks(content string) []Link {
	var links []Link
	seen := make(map[string]bool)

	// Extract wiki links via regex (goldmark doesn't support wiki links)
	for _, match := range wikiLinkRe.FindAllStringSubmatch(content, -1) {
		target := strings.TrimSpace(match[1])
		if target == "" {
			continue
		}
		// wiki links may have display text: [[target|display text]]
		parts := strings.SplitN(target, "|", 2)
		target = strings.TrimSpace(parts[0])
		displayText := target
		if len(parts) == 2 {
			displayText = strings.TrimSpace(parts[1])
		}

		key := "wiki:" + target
		if !seen[key] {
			seen[key] = true
			links = append(links, Link{
				Target: target,
				Text:   displayText,
				Type:   "wiki",
			})
		}
	}

	// Extract markdown links via goldmark AST
	source := []byte(content)
	md := goldmark.New()
	reader := text.NewReader(source)
	doc := md.Parser().Parse(reader)

	ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}

		link, ok := n.(*ast.Link)
		if !ok {
			return ast.WalkContinue, nil
		}

		dest := string(link.Destination)
		if shouldIgnoreLink(dest) {
			return ast.WalkContinue, nil
		}

		// Skip image links (parent is Image)
		if link.Parent() != nil {
			if _, isImg := link.Parent().(*ast.Image); isImg {
				return ast.WalkContinue, nil
			}
		}

		key := "md:" + dest
		if !seen[key] {
			seen[key] = true
			links = append(links, Link{
				Target: dest,
				Text:   string(link.Title),
				Type:   "markdown",
			})
		}

		return ast.WalkContinue, nil
	})

	return links
}

// ResolveLink resolves a link target to a document path relative to KB root.
func ResolveLink(link Link, sourceDir string) string {
	target := link.Target

	switch link.Type {
	case "wiki":
		// Wiki links: try .md extension
		if filepath.Ext(target) == "" {
			target += ".md"
		}
		// Wiki links are relative to KB root
		return filepath.Clean(target)

	case "markdown":
		if shouldIgnoreLink(target) {
			return ""
		}
		// Markdown links: resolve relative to source dir
		resolved := filepath.Join(sourceDir, target)
		return filepath.Clean(resolved)

	default:
		return ""
	}
}

// ExtractAndResolveLinks extracts links and resolves them to KB-relative paths.
func ExtractAndResolveLinks(content, sourceRelDir string) []string {
	links := ExtractLinks(content)
	var paths []string
	seen := make(map[string]bool)

	for _, l := range links {
		resolved := ResolveLink(l, sourceRelDir)
		if resolved == "" || shouldIgnoreLink(resolved) {
			continue
		}
		if !seen[resolved] {
			seen[resolved] = true
			paths = append(paths, resolved)
		}
	}

	return paths
}

func shouldIgnoreLink(dest string) bool {
	if dest == "" {
		return true
	}
	// Ignore external URLs
	if strings.HasPrefix(dest, "http://") || strings.HasPrefix(dest, "https://") {
		return true
	}
	if strings.HasPrefix(dest, "ftp://") || strings.HasPrefix(dest, "mailto:") {
		return true
	}
	// Ignore pure anchors
	if strings.HasPrefix(dest, "#") {
		return true
	}
	return false
}

// ExtractLinksFromDir reads all .md files in dir and returns their links.
// dir is relative to kbRoot. Returns map of docPath -> []resolvedLinkPath.
func ExtractLinksFromDir(kbRoot, subdir string) (map[string][]string, error) {
	scanDir := kbRoot
	if subdir != "" {
		scanDir = filepath.Join(kbRoot, subdir)
	}

	result := make(map[string][]string)

	entries, err := os.ReadDir(scanDir)
	if err != nil {
		return nil, fmt.Errorf("cannot read dir %s: %w", scanDir, err)
	}

	for _, entry := range entries {
		// Recurse into subdirectories
		if entry.IsDir() {
			if strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			subResult, err := ExtractLinksFromDir(kbRoot, filepath.Join(subdir, entry.Name()))
			if err != nil {
				continue
			}
			for k, v := range subResult {
				result[k] = v
			}
			continue
		}

		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".md" && ext != ".markdown" {
			continue
		}

		docPath := entry.Name()
		if subdir != "" {
			docPath = filepath.Join(subdir, docPath)
		}

		fullPath := filepath.Join(kbRoot, docPath)
		data, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		sourceDir := filepath.Dir(docPath)
		links := ExtractAndResolveLinks(string(data), sourceDir)
		if len(links) > 0 {
			result[docPath] = links
		}
	}

	return result, nil
}
