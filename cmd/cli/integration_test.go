//go:build !e2e

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

var binaryPath string

func TestMain(m *testing.M) {
	tmpFile, err := os.CreateTemp("", "mindstack-test-*")
	if err != nil {
		fmt.Fprintf(os.Stderr, "cannot create temp file: %v\n", err)
		os.Exit(1)
	}
	binaryPath = tmpFile.Name()
	tmpFile.Close()

	_, filename, _, _ := runtime.Caller(0)
	cliDir := filepath.Dir(filename)

	build := exec.Command("go", "build", "-o", binaryPath, ".")
	build.Dir = cliDir
	if output, err := build.CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "build failed: %v\n%s\n", err, output)
		os.Exit(1)
	}

	code := m.Run()
	os.Remove(binaryPath)
	os.Exit(code)
}

func runCLI(dir string, stdin string, args ...string) (stdout, stderr string, exitCode int) {
	cmd := exec.Command(binaryPath, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	if stdin != "" {
		cmd.Stdin = strings.NewReader(stdin)
	}
	var outb, errb strings.Builder
	cmd.Stdout = &outb
	cmd.Stderr = &errb
	err := cmd.Run()
	stdout = outb.String()
	stderr = errb.String()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
		}
	}
	return
}

func parseJSON(s string) map[string]interface{} {
	var result map[string]interface{}
	json.Unmarshal([]byte(s), &result)
	return result
}

func setupKB(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	stdout, _, code := runCLI("", "", "init", dir)
	if code != 0 {
		t.Fatalf("init failed (code %d): %s", code, stdout)
	}
	return dir
}

func createFile(t *testing.T, baseDir, relPath, content string) {
	t.Helper()
	fullPath := filepath.Join(baseDir, relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}
}

// --- init command ---

func TestInitCommand(t *testing.T) {
	dir := t.TempDir()
	stdout, _, code := runCLI("", "", "init", dir)
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["initialized"] != true {
		t.Error("expected initialized=true")
	}
	if _, err := os.Stat(filepath.Join(dir, ".mindstack", "config.yaml")); os.IsNotExist(err) {
		t.Error(".mindstack/config.yaml not created")
	}
}

func TestInitDefaultPath(t *testing.T) {
	dir := t.TempDir()
	stdout, _, code := runCLI(dir, "", "init")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["initialized"] != true {
		t.Error("expected initialized=true")
	}
	if _, err := os.Stat(filepath.Join(dir, ".mindstack", "config.yaml")); os.IsNotExist(err) {
		t.Error(".mindstack/config.yaml not created in cwd")
	}
}

func TestInitAlreadyExists(t *testing.T) {
	dir := setupKB(t)
	_, stderr, code := runCLI("", "", "init", dir)
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !strings.Contains(stderr, "ALREADY_EXISTS") {
		t.Errorf("expected ALREADY_EXISTS, got: %s", stderr)
	}
}

// --- link command ---

func TestLinkCommand(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir := filepath.Join(tmpDir, "mykb")
	runCLI("", "", "init", kbDir)

	projectDir := filepath.Join(tmpDir, "project")
	os.MkdirAll(projectDir, 0755)

	stdout, _, code := runCLI(projectDir, "", "link", kbDir)
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["linked"] != true {
		t.Error("expected linked=true")
	}
	if result["name"] != "mykb" {
		t.Errorf("expected name=mykb, got %v", result["name"])
	}

	cfgPath := filepath.Join(projectDir, ".mindstack", "config.yaml")
	if _, err := os.Stat(cfgPath); os.IsNotExist(err) {
		t.Error("project config not created")
	}
}

func TestLinkWithExplicitName(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir := filepath.Join(tmpDir, "mykb")
	runCLI("", "", "init", kbDir)

	projectDir := filepath.Join(tmpDir, "project")
	os.MkdirAll(projectDir, 0755)

	stdout, _, code := runCLI(projectDir, "", "link", kbDir, "--name", "custom-name")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["name"] != "custom-name" {
		t.Errorf("expected name=custom-name, got %v", result["name"])
	}
}

func TestLinkAlreadyLinked(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir := filepath.Join(tmpDir, "mykb")
	runCLI("", "", "init", kbDir)

	projectDir := filepath.Join(tmpDir, "project")
	os.MkdirAll(projectDir, 0755)
	runCLI(projectDir, "", "link", kbDir)

	_, stderr, code := runCLI(projectDir, "", "link", kbDir)
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !strings.Contains(stderr, "ALREADY_LINKED") {
		t.Errorf("expected ALREADY_LINKED, got: %s", stderr)
	}
}

func TestLinkNotAKB(t *testing.T) {
	tmpDir := t.TempDir()
	notAKBDir := filepath.Join(tmpDir, "notakb")
	os.MkdirAll(notAKBDir, 0755)

	projectDir := filepath.Join(tmpDir, "project")
	os.MkdirAll(projectDir, 0755)

	_, stderr, code := runCLI(projectDir, "", "link", notAKBDir)
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !strings.Contains(stderr, "NOT_A_KB") {
		t.Errorf("expected NOT_A_KB, got: %s", stderr)
	}
}

func TestLinkFromKB(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir1 := filepath.Join(tmpDir, "kb1")
	runCLI("", "", "init", kbDir1)

	kbDir2 := filepath.Join(tmpDir, "kb2")
	runCLI("", "", "init", kbDir2)

	_, stderr, code := runCLI(kbDir1, "", "link", kbDir2)
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !strings.Contains(stderr, "IS_KB") {
		t.Errorf("expected IS_KB, got: %s", stderr)
	}
}

// --- ls command ---

func TestLsCommand(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "notes/test1.md", "# Test 1")
	createFile(t, dir, "notes/test2.md", "# Test 2")
	createFile(t, dir, "readme.md", "# README")

	stdout, _, code := runCLI(dir, "", "ls")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	docs := result["documents"].([]interface{})
	if len(docs) != 4 {
		t.Errorf("expected 4 entries, got %d: %v", len(docs), docs)
	}
	if result["total"].(float64) != 4 {
		t.Errorf("total = %v, want 4", result["total"])
	}
}

func TestLsWithPrefix(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "notes/a.md", "# A")
	createFile(t, dir, "notes/b.md", "# B")
	createFile(t, dir, "readme.md", "# README")

	stdout, _, code := runCLI(dir, "", "ls", "notes")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	docs := result["documents"].([]interface{})
	if len(docs) != 2 {
		t.Errorf("expected 2 in notes/, got %d", len(docs))
	}
}

func TestLsEmpty(t *testing.T) {
	dir := setupKB(t)
	stdout, _, code := runCLI(dir, "", "ls")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["total"].(float64) != 0 {
		t.Errorf("expected 0, got %v", result["total"])
	}
}

// --- meta command ---

func TestMetaCommandNoData(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "test.md", "# Hello")

	stdout, _, code := runCLI(dir, "", "meta", filepath.Join(dir, "test.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["found"] != false {
		t.Error("expected found=false")
	}
}

func TestMetaWithMetadata(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "doc.md", "# Test")

	meta := map[string]interface{}{
		"doc.md": map[string]interface{}{
			"title":   "Test Doc",
			"summary": "A test",
			"tags":    []string{"test", "doc"},
			"status":  "active",
		},
	}
	metaData, _ := json.Marshal(meta)
	os.WriteFile(filepath.Join(dir, ".mindstack", "meta.json"), metaData, 0644)

	stdout, _, code := runCLI(dir, "", "meta", filepath.Join(dir, "doc.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["found"] != true {
		t.Error("expected found=true")
	}
	if result["title"] != "Test Doc" {
		t.Errorf("title = %v", result["title"])
	}
}

// --- tags command ---

func TestTagsEmpty(t *testing.T) {
	dir := setupKB(t)
	stdout, _, code := runCLI(dir, "", "tags")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["totalTags"].(float64) != 0 {
		t.Errorf("expected 0 tags, got %v", result["totalTags"])
	}
}

func TestTagsWithData(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "a.md", "# A")
	createFile(t, dir, "b.md", "# B")

	meta := map[string]interface{}{
		"a.md": map[string]interface{}{
			"title": "A",
			"tags":  []string{"go", "test"},
		},
		"b.md": map[string]interface{}{
			"title": "B",
			"tags":  []string{"go", "cli"},
		},
	}
	metaData, _ := json.Marshal(meta)
	os.WriteFile(filepath.Join(dir, ".mindstack", "meta.json"), metaData, 0644)

	stdout, _, code := runCLI(dir, "", "tags")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["totalTags"].(float64) != 3 {
		t.Errorf("expected 3 unique tags, got %v", result["totalTags"])
	}
}

// --- search command ---

func TestSearchFulltext(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "doc1.md", "# Golang\nGolang is a programming language")
	createFile(t, dir, "doc2.md", "# Python\nPython is also a language")
	createFile(t, dir, "doc3.md", "# Rust\nNo match here")

	// Fulltext search requires meta entries to iterate documents
	meta := map[string]interface{}{
		"doc1.md": map[string]interface{}{"title": "Doc1"},
		"doc2.md": map[string]interface{}{"title": "Doc2"},
		"doc3.md": map[string]interface{}{"title": "Doc3"},
	}
	metaData, _ := json.Marshal(meta)
	os.WriteFile(filepath.Join(dir, ".mindstack", "meta.json"), metaData, 0644)

	stdout, _, code := runCLI(dir, "", "search", "--fulltext", "golang")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["mode"] != "fulltext" {
		t.Errorf("mode = %v", result["mode"])
	}
	total, _ := result["total"].(float64)
	if total != 1 {
		t.Errorf("expected 1 result, got %v", result["total"])
	}
}

func TestSearchByTag(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "doc.md", "# Doc")

	meta := map[string]interface{}{
		"doc.md": map[string]interface{}{
			"title": "Doc",
			"tags":  []string{"testing"},
		},
	}
	metaData, _ := json.Marshal(meta)
	os.WriteFile(filepath.Join(dir, ".mindstack", "meta.json"), metaData, 0644)

	stdout, _, code := runCLI(dir, "", "search", "testing")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["mode"] != "tag" {
		t.Errorf("mode = %v", result["mode"])
	}
}

func TestSearchNoResults(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "doc.md", "# Doc")

	stdout, _, code := runCLI(dir, "", "search", "nonexistent_query_xyz")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["total"].(float64) != 0 {
		t.Errorf("expected 0 results, got %v", result["total"])
	}
}

// --- relation command ---

func TestRelationOutgoing(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "a.md", "# A")
	createFile(t, dir, "b.md", "# B")

	rels := map[string]interface{}{
		"a.md": []interface{}{
			map[string]interface{}{
				"source": "a.md",
				"target": "b.md",
				"score":  0.8,
			},
		},
	}
	relData, _ := json.Marshal(rels)
	os.WriteFile(filepath.Join(dir, ".mindstack", "relations.json"), relData, 0644)

	stdout, _, code := runCLI(dir, "", "relation", filepath.Join(dir, "a.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["totalOutgoing"].(float64) != 1 {
		t.Errorf("expected 1 outgoing, got %v", result["totalOutgoing"])
	}
	if result["totalIncoming"].(float64) != 0 {
		t.Errorf("expected 0 incoming, got %v", result["totalIncoming"])
	}
}

func TestRelationIncoming(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "a.md", "# A")
	createFile(t, dir, "b.md", "# B")

	rels := map[string]interface{}{
		"a.md": []interface{}{
			map[string]interface{}{
				"source": "a.md",
				"target": "b.md",
				"score":  0.8,
			},
		},
	}
	relData, _ := json.Marshal(rels)
	os.WriteFile(filepath.Join(dir, ".mindstack", "relations.json"), relData, 0644)

	stdout, _, code := runCLI(dir, "", "relation", filepath.Join(dir, "b.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["totalIncoming"].(float64) != 1 {
		t.Errorf("expected 1 incoming, got %v", result["totalIncoming"])
	}
	if result["totalOutgoing"].(float64) != 0 {
		t.Errorf("expected 0 outgoing, got %v", result["totalOutgoing"])
	}
}

// --- info command ---

func TestInfoCommand(t *testing.T) {
	dir := setupKB(t)
	createFile(t, dir, "doc1.md", "# Doc 1")
	createFile(t, dir, "doc2.md", "# Doc 2")

	// Info counts documents with metadata entries
	meta := map[string]interface{}{
		"doc1.md": map[string]interface{}{"title": "Doc1"},
		"doc2.md": map[string]interface{}{"title": "Doc2"},
	}
	metaData, _ := json.Marshal(meta)
	os.WriteFile(filepath.Join(dir, ".mindstack", "meta.json"), metaData, 0644)

	stdout, _, code := runCLI(dir, "", "info")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	if result["name"] == nil {
		t.Error("expected name field")
	}
	if result["documentCount"].(float64) != 2 {
		t.Errorf("documentCount = %v, want 2", result["documentCount"])
	}
}

// --- not initialized ---

func TestNotInitialized(t *testing.T) {
	dir := t.TempDir()
	_, stderr, code := runCLI(dir, "", "ls")
	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !strings.Contains(stderr, "NOT_INITIALIZED") {
		t.Errorf("expected NOT_INITIALIZED, got: %s", stderr)
	}
}

// --- --kb flag ---

func TestWithKBFlag(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir := filepath.Join(tmpDir, "mykb")
	runCLI("", "", "init", kbDir)
	createFile(t, kbDir, "test.md", "# Hello")

	projectDir := filepath.Join(tmpDir, "project")
	os.MkdirAll(filepath.Join(projectDir, ".mindstack"), 0755)
	cfgContent := fmt.Sprintf("knowledge_bases:\n  - %q\n", kbDir)
	os.WriteFile(filepath.Join(projectDir, ".mindstack", "config.yaml"), []byte(cfgContent), 0644)

	stdout, _, code := runCLI(projectDir, "", "--kb", "mykb", "ls")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := parseJSON(stdout)
	docs := result["documents"].([]interface{})
	if len(docs) != 1 {
		t.Errorf("expected 1 document, got %d", len(docs))
	}
}

func TestWithKBFlagNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir := filepath.Join(tmpDir, "mykb")
	runCLI("", "", "init", kbDir)

	projectDir := filepath.Join(tmpDir, "project")
	os.MkdirAll(filepath.Join(projectDir, ".mindstack"), 0755)
	cfgContent := fmt.Sprintf("knowledge_bases:\n  - %q\n", kbDir)
	os.WriteFile(filepath.Join(projectDir, ".mindstack", "config.yaml"), []byte(cfgContent), 0644)

	_, stderr, code := runCLI(projectDir, "", "--kb", "nonexistent", "ls")
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !strings.Contains(stderr, "KB_NOT_FOUND") {
		t.Errorf("expected KB_NOT_FOUND, got: %s", stderr)
	}
}
