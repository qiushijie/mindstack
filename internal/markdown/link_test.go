package markdown

import (
	"os"
	"path/filepath"
	"testing"
)

func TestExtractLinks_Markdown(t *testing.T) {
	content := "See [API Spec](api-specs/rest-api.md) and [Design](design.md)."
	links := ExtractLinks(content)

	if len(links) != 2 {
		t.Fatalf("expected 2 links, got %d", len(links))
	}

	found := map[string]bool{}
	for _, l := range links {
		found[l.Target] = true
		if l.Type != "markdown" {
			t.Fatalf("expected type markdown, got %s", l.Type)
		}
	}
	if !found["api-specs/rest-api.md"] || !found["design.md"] {
		t.Fatalf("missing expected links, got %v", links)
	}
}

func TestExtractLinks_Wiki(t *testing.T) {
	content := "See [[api-specs/rest-api]] and [[ADR-001|ADR 001]]."
	links := ExtractLinks(content)

	if len(links) != 2 {
		t.Fatalf("expected 2 links, got %d", len(links))
	}

	if links[0].Target != "api-specs/rest-api" {
		t.Fatalf("expected target 'api-specs/rest-api', got %s", links[0].Target)
	}
	if links[0].Type != "wiki" {
		t.Fatalf("expected type wiki, got %s", links[0].Type)
	}

	// Wiki link with display text
	if links[1].Target != "ADR-001" {
		t.Fatalf("expected target 'ADR-001', got %s", links[1].Target)
	}
	if links[1].Text != "ADR 001" {
		t.Fatalf("expected text 'ADR 001', got %s", links[1].Text)
	}
}

func TestExtractLinks_ExternalURL(t *testing.T) {
	content := "See [Google](https://google.com) and [FTP](ftp://server.com)."
	links := ExtractLinks(content)

	if len(links) != 0 {
		t.Fatalf("expected 0 links (external URLs ignored), got %d", len(links))
	}
}

func TestExtractLinks_Anchor(t *testing.T) {
	content := "See [section](#heading) for details."
	links := ExtractLinks(content)

	if len(links) != 0 {
		t.Fatalf("expected 0 links (anchor ignored), got %d", len(links))
	}
}

func TestExtractLinks_Mixed(t *testing.T) {
	content := `See [[wiki-link]] and [MD Link](path.md) and https://example.com and #anchor`
	links := ExtractLinks(content)

	if len(links) != 2 {
		t.Fatalf("expected 2 links, got %d: %+v", len(links), links)
	}
}

func TestExtractLinks_Empty(t *testing.T) {
	links := ExtractLinks("")
	if len(links) != 0 {
		t.Fatalf("expected 0, got %d", len(links))
	}
}

func TestResolveLink_Wiki(t *testing.T) {
	link := Link{Target: "api-specs/rest-api", Type: "wiki"}
	resolved := ResolveLink(link, "")
	if resolved != "api-specs/rest-api.md" {
		t.Fatalf("expected 'api-specs/rest-api.md', got %s", resolved)
	}
}

func TestResolveLink_WikiWithExt(t *testing.T) {
	link := Link{Target: "api-specs/rest-api.md", Type: "wiki"}
	resolved := ResolveLink(link, "")
	if resolved != "api-specs/rest-api.md" {
		t.Fatalf("expected 'api-specs/rest-api.md', got %s", resolved)
	}
}

func TestResolveLink_Markdown(t *testing.T) {
	link := Link{Target: "../other/doc.md", Type: "markdown"}
	resolved := ResolveLink(link, "api-specs")
	if resolved != "other/doc.md" {
		t.Fatalf("expected 'other/doc.md', got %s", resolved)
	}
}

func TestResolveLink_MarkdownCurrentDir(t *testing.T) {
	link := Link{Target: "sibling.md", Type: "markdown"}
	resolved := ResolveLink(link, "api-specs")
	if resolved != "api-specs/sibling.md" {
		t.Fatalf("expected 'api-specs/sibling.md', got %s", resolved)
	}
}

// --- ExtractAndResolveLinks tests ---

func TestExtractAndResolveLinks_WikiLinks(t *testing.T) {
	content := "See [[api-specs/rest-api]] and [[design]]."
	paths := ExtractAndResolveLinks(content, "")
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %d: %v", len(paths), paths)
	}
	found := map[string]bool{}
	for _, p := range paths {
		found[p] = true
	}
	if !found["api-specs/rest-api.md"] {
		t.Fatalf("expected 'api-specs/rest-api.md' in results, got %v", paths)
	}
	if !found["design.md"] {
		t.Fatalf("expected 'design.md' in results, got %v", paths)
	}
}

func TestExtractAndResolveLinks_MarkdownLinks(t *testing.T) {
	content := "See [API](api-specs/rest-api.md) and [Design](design.md)."
	paths := ExtractAndResolveLinks(content, "docs")
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %d: %v", len(paths), paths)
	}
	found := map[string]bool{}
	for _, p := range paths {
		found[p] = true
	}
	if !found["docs/api-specs/rest-api.md"] {
		t.Fatalf("expected 'docs/api-specs/rest-api.md' in results, got %v", paths)
	}
	if !found["docs/design.md"] {
		t.Fatalf("expected 'docs/design.md' in results, got %v", paths)
	}
}

func TestExtractAndResolveLinks_Mixed(t *testing.T) {
	content := "See [[wiki-link]] and [MD](path.md) and https://example.com and #anchor"
	paths := ExtractAndResolveLinks(content, "subdir")
	if len(paths) != 2 {
		t.Fatalf("expected 2 paths, got %d: %v", len(paths), paths)
	}
	found := map[string]bool{}
	for _, p := range paths {
		found[p] = true
	}
	if !found["wiki-link.md"] {
		t.Fatalf("expected 'wiki-link.md' in results, got %v", paths)
	}
	if !found["subdir/path.md"] {
		t.Fatalf("expected 'subdir/path.md' in results, got %v", paths)
	}
}

func TestExtractAndResolveLinks_Deduplication(t *testing.T) {
	content := "See [[foo]] and [[foo]] and [foo](foo.md)."
	paths := ExtractAndResolveLinks(content, "")
	// Wiki link resolves to "foo.md" and markdown link resolves to "foo.md" (in "." dir)
	// Both should be deduplicated
	if len(paths) != 1 {
		t.Fatalf("expected 1 deduplicated path, got %d: %v", len(paths), paths)
	}
}

func TestExtractAndResolveLinks_Empty(t *testing.T) {
	paths := ExtractAndResolveLinks("", "")
	if len(paths) != 0 {
		t.Fatalf("expected 0 paths, got %d", len(paths))
	}
}

func TestExtractAndResolveLinks_OnlyExternal(t *testing.T) {
	content := "See [Google](https://google.com) and [FTP](ftp://server.com) and [Email](mailto:a@b.com)."
	paths := ExtractAndResolveLinks(content, "")
	if len(paths) != 0 {
		t.Fatalf("expected 0 paths (all external), got %d: %v", len(paths), paths)
	}
}

func TestExtractAndResolveLinks_ParentDirTraversal(t *testing.T) {
	content := "See [Parent](../other.md)."
	paths := ExtractAndResolveLinks(content, "sub/deep")
	if len(paths) != 1 {
		t.Fatalf("expected 1 path, got %d: %v", len(paths), paths)
	}
	if paths[0] != "sub/other.md" {
		t.Fatalf("expected 'sub/other.md', got %s", paths[0])
	}
}

func TestExtractAndResolveLinks_WikiLinkAlreadyHasExt(t *testing.T) {
	content := "[[notes/design.md]]"
	paths := ExtractAndResolveLinks(content, "")
	if len(paths) != 1 {
		t.Fatalf("expected 1 path, got %d: %v", len(paths), paths)
	}
	if paths[0] != "notes/design.md" {
		t.Fatalf("expected 'notes/design.md', got %s", paths[0])
	}
}

// --- ExtractLinksFromDir tests ---

func TestExtractLinksFromDir_BasicFiles(t *testing.T) {
	dir := t.TempDir()

	// Create markdown files with links
	os.WriteFile(filepath.Join(dir, "index.md"), []byte("See [[design]] and [API](api/rest.md)."), 0644)
	os.MkdirAll(filepath.Join(dir, "api"), 0755)
	os.WriteFile(filepath.Join(dir, "api", "rest.md"), []byte("See [Models](models.md)."), 0644)

	result, err := ExtractLinksFromDir(dir, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// index.md should have 2 resolved links
	indexLinks, ok := result["index.md"]
	if !ok {
		t.Fatalf("expected index.md in result, got keys: %v", mapKeys(result))
	}
	if len(indexLinks) != 2 {
		t.Fatalf("expected 2 links from index.md, got %d: %v", len(indexLinks), indexLinks)
	}

	// api/rest.md should have 1 resolved link
	restLinks := result[filepath.Join("api", "rest.md")]
	if len(restLinks) != 1 {
		t.Fatalf("expected 1 link from api/rest.md, got %d: %v", len(restLinks), restLinks)
	}
	if restLinks[0] != "api/models.md" {
		t.Fatalf("expected 'api/models.md', got %s", restLinks[0])
	}
}

func TestExtractLinksFromDir_Subdir(t *testing.T) {
	dir := t.TempDir()

	os.MkdirAll(filepath.Join(dir, "notes"), 0755)
	os.WriteFile(filepath.Join(dir, "notes", "a.md"), []byte("[[b]] and [c](c.md)"), 0644)

	// Scan only the notes subdirectory
	result, err := ExtractLinksFromDir(dir, "notes")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	aKey := filepath.Join("notes", "a.md")
	links, ok := result[aKey]
	if !ok {
		t.Fatalf("expected %s in result, got keys: %v", aKey, mapKeys(result))
	}
	if len(links) != 2 {
		t.Fatalf("expected 2 links, got %d: %v", len(links), links)
	}
}

func TestExtractLinksFromDir_EmptyDir(t *testing.T) {
	dir := t.TempDir()

	result, err := ExtractLinksFromDir(dir, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 0 {
		t.Fatalf("expected empty result, got %v", result)
	}
}

func TestExtractLinksFromDir_NonexistentDir(t *testing.T) {
	dir := t.TempDir()
	_, err := ExtractLinksFromDir(filepath.Join(dir, "no-such-dir"), "")
	if err == nil {
		t.Fatal("expected error for nonexistent directory")
	}
}

func TestExtractLinksFromDir_SkipsDotDirs(t *testing.T) {
	dir := t.TempDir()

	// Create a .hidden directory with a markdown file
	os.MkdirAll(filepath.Join(dir, ".hidden"), 0755)
	os.WriteFile(filepath.Join(dir, ".hidden", "secret.md"), []byte("[[should-not-appear]]"), 0644)

	// Create a normal file to confirm scanning works
	os.WriteFile(filepath.Join(dir, "visible.md"), []byte("[[target]]"), 0644)

	result, err := ExtractLinksFromDir(dir, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if _, hasHidden := result[filepath.Join(".hidden", "secret.md")]; hasHidden {
		t.Fatal("expected .hidden directory to be skipped")
	}
	if _, hasVisible := result["visible.md"]; !hasVisible {
		t.Fatal("expected visible.md in result")
	}
}

func TestExtractLinksFromDir_SkipsNonMarkdown(t *testing.T) {
	dir := t.TempDir()

	os.WriteFile(filepath.Join(dir, "data.json"), []byte(`{"key": "value"}`), 0644)
	os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("not markdown"), 0644)
	os.WriteFile(filepath.Join(dir, "real.md"), []byte("[[link]]"), 0644)

	result, err := ExtractLinksFromDir(dir, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected 1 result, got %d: %v", len(result), result)
	}
	if _, ok := result["real.md"]; !ok {
		t.Fatal("expected real.md in result")
	}
}

func TestExtractLinksFromDir_MarkdownExtension(t *testing.T) {
	dir := t.TempDir()

	// .markdown extension should also be recognized
	os.WriteFile(filepath.Join(dir, "notes.markdown"), []byte("[[target]]"), 0644)

	result, err := ExtractLinksFromDir(dir, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := result["notes.markdown"]; !ok {
		t.Fatalf("expected notes.markdown in result, got keys: %v", mapKeys(result))
	}
}

func TestExtractLinksFromDir_FileWithNoLinks(t *testing.T) {
	dir := t.TempDir()

	os.WriteFile(filepath.Join(dir, "empty.md"), []byte("No links here."), 0644)
	os.WriteFile(filepath.Join(dir, "linked.md"), []byte("[[empty]]"), 0644)

	result, err := ExtractLinksFromDir(dir, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Files with no links should not appear in the result map
	if _, ok := result["empty.md"]; ok {
		t.Fatal("expected empty.md to not be in result (no links)")
	}
	if _, ok := result["linked.md"]; !ok {
		t.Fatal("expected linked.md in result")
	}
}

// helper to get map keys for error messages
func mapKeys(m map[string][]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}
