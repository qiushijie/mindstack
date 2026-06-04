package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"mindstack/internal/chat"
	"mindstack/internal/config"
	"mindstack/internal/db"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type testExit struct {
	code int
}

func (e testExit) Error() string {
	return fmt.Sprintf("exit code %d", e.code)
}

func resetFlags() {
	kbName = ""
	linkName = ""
	searchFulltext = false
	resetCmdFlags(rootCmd)
}

func resetCmdFlags(cmd *cobra.Command) {
	cmd.Flags().VisitAll(func(f *pflag.Flag) {
		f.Changed = false
	})
	for _, sub := range cmd.Commands() {
		resetCmdFlags(sub)
	}
}

func runCmd(t *testing.T, args ...string) (stdout, stderr string, exitCode int) {
	t.Helper()
	resetFlags()

	var outb, errb bytes.Buffer
	stdoutWriter = &outb
	stderrWriter = &errb
	exitFunc = func(code int) {
		panic(testExit{code})
	}

	defer func() {
		stdoutWriter = os.Stdout
		stderrWriter = os.Stderr
		exitFunc = os.Exit
		stdout = outb.String()
		stderr = errb.String()
	}()

	defer func() {
		if r := recover(); r != nil {
			if e, ok := r.(testExit); ok {
				exitCode = e.code
			} else {
				panic(r)
			}
		}
	}()

	rootCmd.SetArgs(args)
	rootCmd.Execute()

	return
}

func cmdParseJSON(s string) map[string]interface{} {
	var result map[string]interface{}
	json.Unmarshal([]byte(s), &result)
	return result
}

func setupTestKB(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	kbDir := filepath.Join(dir, ".mindstack")
	if err := os.MkdirAll(kbDir, 0755); err != nil {
		t.Fatal(err)
	}
	cfg := config.DefaultConfig()
	cfg.Name = filepath.Base(dir)
	if err := config.SaveConfig(filepath.Join(kbDir, "config.yaml"), cfg); err != nil {
		t.Fatal(err)
	}

	oldDir, _ := os.Getwd()
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chdir(oldDir) })

	return dir
}

func createTestFile(t *testing.T, baseDir, relPath, content string) {
	t.Helper()
	fullPath := filepath.Join(baseDir, relPath)
	if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func writeTestMeta(t *testing.T, kbDir string, meta map[string]interface{}) {
	t.Helper()
	data, _ := json.Marshal(meta)
	if err := os.WriteFile(filepath.Join(kbDir, ".mindstack", "meta.json"), data, 0644); err != nil {
		t.Fatal(err)
	}
}

func writeTestRelations(t *testing.T, kbDir string, rels map[string]interface{}) {
	t.Helper()
	data, _ := json.Marshal(rels)
	if err := os.WriteFile(filepath.Join(kbDir, ".mindstack", "relations.json"), data, 0644); err != nil {
		t.Fatal(err)
	}
}

// --- init command ---

func TestCmdInit(t *testing.T) {
	dir := t.TempDir()
	stdout, _, code := runCmd(t, "init", dir)
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["initialized"] != true {
		t.Error("expected initialized=true")
	}
	if _, err := os.Stat(filepath.Join(dir, ".mindstack", "config.yaml")); os.IsNotExist(err) {
		t.Error("config.yaml not created")
	}
}

func TestCmdInitDefaultPath(t *testing.T) {
	dir := t.TempDir()
	oldDir, _ := os.Getwd()
	os.Chdir(dir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	stdout, _, code := runCmd(t, "init")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["initialized"] != true {
		t.Error("expected initialized=true")
	}
}

func TestCmdInitAlreadyExists(t *testing.T) {
	dir := setupTestKB(t)
	_, stderr, code := runCmd(t, "init", dir)
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("ALREADY_EXISTS")) {
		t.Errorf("expected ALREADY_EXISTS, got: %s", stderr)
	}
}

// --- link command ---

func TestCmdLink(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir := filepath.Join(tmpDir, "mykb")
	kbInner := filepath.Join(kbDir, ".mindstack")
	os.MkdirAll(kbInner, 0755)
	cfg := config.DefaultConfig()
	cfg.Name = "mykb"
	config.SaveConfig(filepath.Join(kbInner, "config.yaml"), cfg)

	projectDir := filepath.Join(tmpDir, "project")
	os.MkdirAll(projectDir, 0755)

	oldDir, _ := os.Getwd()
	os.Chdir(projectDir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	stdout, _, code := runCmd(t, "link", kbDir)
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["linked"] != true {
		t.Error("expected linked=true")
	}
}

func TestCmdLinkNotAKB(t *testing.T) {
	tmpDir := t.TempDir()
	notAKB := filepath.Join(tmpDir, "notakb")
	os.MkdirAll(notAKB, 0755)

	projectDir := filepath.Join(tmpDir, "project")
	os.MkdirAll(projectDir, 0755)

	oldDir, _ := os.Getwd()
	os.Chdir(projectDir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "link", notAKB)
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_A_KB")) {
		t.Errorf("expected NOT_A_KB, got: %s", stderr)
	}
}

func TestCmdLinkFromKB(t *testing.T) {
	_ = setupTestKB(t)

	tmpDir := t.TempDir()
	kbDir2 := filepath.Join(tmpDir, "kb2")
	kbInner2 := filepath.Join(kbDir2, ".mindstack")
	os.MkdirAll(kbInner2, 0755)
	cfg2 := config.DefaultConfig()
	cfg2.Name = "kb2"
	config.SaveConfig(filepath.Join(kbInner2, "config.yaml"), cfg2)

	_, stderr, code := runCmd(t, "link", kbDir2)
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("IS_KB")) {
		t.Errorf("expected IS_KB, got: %s", stderr)
	}
}

// --- ls command ---

func TestCmdLs(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "notes/a.md", "# A")
	createTestFile(t, dir, "notes/b.md", "# B")
	createTestFile(t, dir, "readme.md", "# README")

	stdout, _, code := runCmd(t, "doc", "ls")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["total"].(float64) != 4 {
		t.Errorf("total = %v, want 4", result["total"])
	}
}

func TestCmdLsWithPrefix(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "notes/a.md", "# A")
	createTestFile(t, dir, "readme.md", "# R")

	stdout, _, code := runCmd(t, "doc", "ls", "notes")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["total"].(float64) != 1 {
		t.Errorf("total = %v, want 1", result["total"])
	}
}

func TestCmdLsEmpty(t *testing.T) {
	setupTestKB(t)
	stdout, _, code := runCmd(t, "doc", "ls")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["total"].(float64) != 0 {
		t.Errorf("total = %v, want 0", result["total"])
	}
}

// --- meta command ---

func TestCmdMetaNoData(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "test.md", "# Hello")

	stdout, _, code := runCmd(t, "doc", "meta", filepath.Join(dir, "test.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["found"] != false {
		t.Error("expected found=false")
	}
}

func TestCmdMetaWithData(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "doc.md", "# Test")
	writeTestMeta(t, dir, map[string]interface{}{
		"doc.md": map[string]interface{}{
			"title":   "Test Doc",
			"summary": "A test",
			"tags":    []string{"test"},
			"status":  "active",
		},
	})

	stdout, _, code := runCmd(t, "doc", "meta", filepath.Join(dir, "doc.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["found"] != true {
		t.Error("expected found=true")
	}
	if result["title"] != "Test Doc" {
		t.Errorf("title = %v", result["title"])
	}
}

func TestCmdMetaRejectsRelativePath(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "doc.md", "# Test")

	_, stderr, code := runCmd(t, "doc", "meta", "doc.md")
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("INVALID_PATH")) {
		t.Errorf("expected INVALID_PATH, got: %s", stderr)
	}
}

// --- tags command ---

func TestCmdTagsEmpty(t *testing.T) {
	setupTestKB(t)
	stdout, _, code := runCmd(t, "tags")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["totalTags"].(float64) != 0 {
		t.Errorf("totalTags = %v", result["totalTags"])
	}
}

func TestCmdTagsWithData(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "a.md", "# A")
	createTestFile(t, dir, "b.md", "# B")
	writeTestMeta(t, dir, map[string]interface{}{
		"a.md": map[string]interface{}{"title": "A", "tags": []string{"go", "test"}},
		"b.md": map[string]interface{}{"title": "B", "tags": []string{"go", "cli"}},
	})

	stdout, _, code := runCmd(t, "tags")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["totalTags"].(float64) != 3 {
		t.Errorf("totalTags = %v, want 3", result["totalTags"])
	}
}

// --- search command ---

func TestCmdSearchFulltext(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "doc1.md", "# Golang\nGolang is great")
	createTestFile(t, dir, "doc2.md", "# Rust\nNo match here")
	writeTestMeta(t, dir, map[string]interface{}{
		"doc1.md": map[string]interface{}{"title": "Doc1"},
		"doc2.md": map[string]interface{}{"title": "Doc2"},
	})

	stdout, _, code := runCmd(t, "search", "--fulltext", "golang")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["mode"] != "fulltext" {
		t.Errorf("mode = %v", result["mode"])
	}
	if result["total"].(float64) != 1 {
		t.Errorf("total = %v, want 1", result["total"])
	}
}

func TestCmdSearchByTag(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "doc.md", "# Doc")
	writeTestMeta(t, dir, map[string]interface{}{
		"doc.md": map[string]interface{}{"title": "Doc", "tags": []string{"testing"}},
	})

	stdout, _, code := runCmd(t, "search", "testing")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["mode"] != "tag" {
		t.Errorf("mode = %v", result["mode"])
	}
}

func TestCmdSearchByMultiTag(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "doc1.md", "# Doc1")
	createTestFile(t, dir, "doc2.md", "# Doc2")
	createTestFile(t, dir, "doc3.md", "# Doc3")
	writeTestMeta(t, dir, map[string]interface{}{
		"doc1.md": map[string]interface{}{"title": "Doc1", "tags": []string{"api", "design"}},
		"doc2.md": map[string]interface{}{"title": "Doc2", "tags": []string{"api"}},
		"doc3.md": map[string]interface{}{"title": "Doc3", "tags": []string{"design"}},
	})

	t.Run("and_semantics", func(t *testing.T) {
		stdout, _, code := runCmd(t, "search", "api,design")
		if code != 0 {
			t.Fatalf("exit code %d", code)
		}
		result := cmdParseJSON(stdout)
		if result["mode"] != "tag" {
			t.Errorf("mode = %v", result["mode"])
		}
		if result["total"].(float64) != 1 {
			t.Errorf("total = %v, want 1 (api AND design)", result["total"])
		}
	})

	t.Run("with_spaces", func(t *testing.T) {
		stdout, _, code := runCmd(t, "search", "api , design")
		if code != 0 {
			t.Fatalf("exit code %d", code)
		}
		result := cmdParseJSON(stdout)
		if result["total"].(float64) != 1 {
			t.Errorf("total = %v, want 1", result["total"])
		}
	})
}

func TestCmdSearchNoResults(t *testing.T) {
	setupTestKB(t)
	stdout, _, code := runCmd(t, "search", "nonexistent_xyz")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["total"].(float64) != 0 {
		t.Errorf("total = %v, want 0", result["total"])
	}
}

// --- related command ---

func TestCmdRelatedDocs(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "a.md", "# A")
	createTestFile(t, dir, "b.md", "# B")
	createTestFile(t, dir, "c.md", "# C")
	writeTestRelations(t, dir, map[string]interface{}{
		"a.md": []interface{}{
			map[string]interface{}{"source": "a.md", "target": "b.md", "score": 0.8, "reason": "linked", "sharedTags": []string{"x"}},
		},
	})

	stdout, _, code := runCmd(t, "related", "docs", filepath.Join(dir, "a.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["total"].(float64) != 1 {
		t.Errorf("total = %v, want 1", result["total"])
	}
	related := result["related"].([]interface{})
	if len(related) != 1 {
		t.Errorf("related count = %v, want 1", len(related))
	}
}

func TestCmdRelatedDocsOutgoingOnly(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "a.md", "# A")
	createTestFile(t, dir, "b.md", "# B")
	createTestFile(t, dir, "c.md", "# C")
	writeTestRelations(t, dir, map[string]interface{}{
		"a.md": []interface{}{
			map[string]interface{}{"source": "a.md", "target": "b.md", "score": 0.8, "reason": "", "sharedTags": []string{}},
		},
		"c.md": []interface{}{
			map[string]interface{}{"source": "c.md", "target": "a.md", "score": 0.6, "reason": "", "sharedTags": []string{}},
		},
	})

	stdout, _, code := runCmd(t, "related", "docs", filepath.Join(dir, "a.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["total"].(float64) != 1 {
		t.Errorf("total = %v, want 1 (only b.md outgoing, not c.md incoming)", result["total"])
	}
	related := result["related"].([]interface{})
	if len(related) != 1 || !strings.Contains(related[0].(string), "b.md") {
		t.Errorf("expected b.md in related, got %v", related)
	}
}

func TestCmdRelatedTags(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "doc1.md", "# Doc1")
	createTestFile(t, dir, "doc2.md", "# Doc2")
	writeTestMeta(t, dir, map[string]interface{}{
		"doc1.md": map[string]interface{}{"title": "Doc1", "tags": []string{"api", "design"}},
		"doc2.md": map[string]interface{}{"title": "Doc2", "tags": []string{"api"}},
	})

	stdout, _, code := runCmd(t, "related", "tags")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["totalTags"].(float64) != 2 {
		t.Errorf("totalTags = %v, want 2", result["totalTags"])
	}
}

func TestCmdRelatedDocsNoRelations(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "a.md", "# A")

	stdout, _, code := runCmd(t, "related", "docs", filepath.Join(dir, "a.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["total"].(float64) != 0 {
		t.Errorf("total = %v, want 0", result["total"])
	}
}

// --- relation command ---

func TestCmdRelationOutgoing(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "a.md", "# A")
	createTestFile(t, dir, "b.md", "# B")
	writeTestRelations(t, dir, map[string]interface{}{
		"a.md": []interface{}{
			map[string]interface{}{"source": "a.md", "target": "b.md", "score": 0.8},
		},
	})

	stdout, _, code := runCmd(t, "doc", "relation", filepath.Join(dir, "a.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["totalOutgoing"].(float64) != 1 {
		t.Errorf("totalOutgoing = %v", result["totalOutgoing"])
	}
	if result["totalIncoming"].(float64) != 0 {
		t.Errorf("totalIncoming = %v", result["totalIncoming"])
	}
}

func TestCmdRelationIncoming(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "a.md", "# A")
	createTestFile(t, dir, "b.md", "# B")
	writeTestRelations(t, dir, map[string]interface{}{
		"a.md": []interface{}{
			map[string]interface{}{"source": "a.md", "target": "b.md", "score": 0.8},
		},
	})

	stdout, _, code := runCmd(t, "doc", "relation", filepath.Join(dir, "b.md"))
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["totalIncoming"].(float64) != 1 {
		t.Errorf("totalIncoming = %v", result["totalIncoming"])
	}
}

func TestCmdRelationRejectsRelativePath(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "a.md", "# A")

	_, stderr, code := runCmd(t, "doc", "relation", "a.md")
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("INVALID_PATH")) {
		t.Errorf("expected INVALID_PATH, got: %s", stderr)
	}
}

// --- info command ---

func TestCmdInfo(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "a.md", "# A")
	createTestFile(t, dir, "b.md", "# B")
	writeTestMeta(t, dir, map[string]interface{}{
		"a.md": map[string]interface{}{"title": "A"},
		"b.md": map[string]interface{}{"title": "B"},
	})

	stdout, _, code := runCmd(t, "info")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["documentCount"].(float64) != 2 {
		t.Errorf("documentCount = %v, want 2", result["documentCount"])
	}
}

// --- not initialized ---

func TestCmdNotInitialized(t *testing.T) {
	dir := t.TempDir()
	oldDir, _ := os.Getwd()
	os.Chdir(dir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "doc", "ls")
	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_INITIALIZED")) {
		t.Errorf("expected NOT_INITIALIZED, got: %s", stderr)
	}
}

// --- --kb flag ---

func TestCmdWithKBFlag(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir := filepath.Join(tmpDir, "mykb")
	kbInner := filepath.Join(kbDir, ".mindstack")
	os.MkdirAll(kbInner, 0755)
	cfg := config.DefaultConfig()
	cfg.Name = "mykb"
	config.SaveConfig(filepath.Join(kbInner, "config.yaml"), cfg)
	createTestFile(t, kbDir, "test.md", "# Hello")

	projectDir := filepath.Join(tmpDir, "project")
	projInner := filepath.Join(projectDir, ".mindstack")
	os.MkdirAll(projInner, 0755)
	projCfg := fmt.Sprintf("knowledge_bases:\n  - %q\n", kbDir)
	os.WriteFile(filepath.Join(projInner, "config.yaml"), []byte(projCfg), 0644)

	oldDir, _ := os.Getwd()
	os.Chdir(projectDir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	stdout, _, code := runCmd(t, "--kb", "mykb", "doc", "ls")
	if code != 0 {
		t.Fatalf("exit code %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["total"].(float64) != 1 {
		t.Errorf("total = %v, want 1", result["total"])
	}
}

func TestCmdWithKBFlagNotFound(t *testing.T) {
	tmpDir := t.TempDir()
	kbDir := filepath.Join(tmpDir, "mykb")
	kbInner := filepath.Join(kbDir, ".mindstack")
	os.MkdirAll(kbInner, 0755)
	cfg := config.DefaultConfig()
	cfg.Name = "mykb"
	config.SaveConfig(filepath.Join(kbInner, "config.yaml"), cfg)

	projectDir := filepath.Join(tmpDir, "project")
	projInner := filepath.Join(projectDir, ".mindstack")
	os.MkdirAll(projInner, 0755)
	projCfg := fmt.Sprintf("knowledge_bases:\n  - %q\n", kbDir)
	os.WriteFile(filepath.Join(projInner, "config.yaml"), []byte(projCfg), 0644)

	oldDir, _ := os.Getwd()
	os.Chdir(projectDir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "--kb", "nonexistent", "doc", "ls")
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("KB_NOT_FOUND")) {
		t.Errorf("expected KB_NOT_FOUND, got: %s", stderr)
	}
}

// --- ack command ---

func TestCmdAckNotInitialized(t *testing.T) {
	dir := t.TempDir()
	oldDir, _ := os.Getwd()
	os.Chdir(dir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "ack", "test query")
	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_INITIALIZED")) {
		t.Errorf("expected NOT_INITIALIZED, got: %s", stderr)
	}
}

func TestCmdAckNoLLM(t *testing.T) {
	setupTestKB(t)
	t.Setenv("MINDSTACK_CONFIG_DIR", t.TempDir())
	_, stderr, code := runCmd(t, "ack", "test query")
	if code != 3 {
		t.Fatalf("expected exit code 3, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("LLM_UNAVAILABLE")) {
		t.Errorf("expected LLM_UNAVAILABLE, got: %s", stderr)
	}
}

func TestCmdAckEmptyResult(t *testing.T) {
	dir := setupTestKB(t)
	createTestFile(t, dir, "doc.md", "# Hello\nworld")
	writeTestMeta(t, dir, map[string]interface{}{
		"doc.md": map[string]interface{}{"title": "Doc", "tags": []string{}},
	})

	configDir := t.TempDir()
	fakeConfig := map[string]interface{}{
		"settings": map[string]interface{}{
			"activeModelId": "test",
			"models": []map[string]interface{}{
				{"id": "test", "apiUrl": "http://localhost:9999", "apiKey": "fake"},
			},
		},
	}
	data, _ := json.Marshal(fakeConfig)
	os.WriteFile(filepath.Join(configDir, "config.json"), data, 0644)
	t.Setenv("MINDSTACK_CONFIG_DIR", configDir)

	stdout, _, code := runCmd(t, "ack", "nonexistent_xyz")
	if code != 0 {
		t.Fatalf("expected exit code 0, got %d", code)
	}
	result := cmdParseJSON(stdout)
	if result["query"] != "nonexistent_xyz" {
		t.Errorf("query = %v", result["query"])
	}
	snippets, ok := result["snippets"].([]interface{})
	if !ok || len(snippets) != 0 {
		t.Errorf("expected empty snippets, got %v", result["snippets"])
	}
}

func TestCmdAckEmptyQuery(t *testing.T) {
	setupTestKB(t)
	configDir := t.TempDir()
	fakeConfig := map[string]interface{}{
		"settings": map[string]interface{}{
			"activeModelId": "test",
			"models": []map[string]interface{}{
				{"id": "test", "apiUrl": "http://localhost:9999", "apiKey": "fake"},
			},
		},
	}
	data, _ := json.Marshal(fakeConfig)
	os.WriteFile(filepath.Join(configDir, "config.json"), data, 0644)
	t.Setenv("MINDSTACK_CONFIG_DIR", configDir)

	_, stderr, code := runCmd(t, "ack", "")
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("ACK_FAILED")) {
		t.Errorf("expected ACK_FAILED, got: %s", stderr)
	}
}

// --- history command ---

func TestCmdHistoryShowInvalidID(t *testing.T) {
	_ = setupTestKB(t)

	_, stderr, code := runCmd(t, "history", "show", "abc")
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("INVALID_ID")) {
		t.Errorf("expected INVALID_ID, got: %s", stderr)
	}
}

func TestCmdHistoryDelInvalidID(t *testing.T) {
	setupTestKB(t)

	_, stderr, code := runCmd(t, "history", "del", "abc")
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("INVALID_ID")) {
		t.Errorf("expected INVALID_ID, got: %s", stderr)
	}
}

func TestCmdHistoryLs(t *testing.T) {
	_ = setupTestKB(t)

	stdout, _, code := runCmd(t, "history", "ls")
	if code != 0 {
		t.Fatalf("expected exit code 0, got %d", code)
	}
	result := cmdParseJSON(stdout)
	if _, ok := result["sessions"]; !ok {
		t.Errorf("expected sessions key in output, got %v", result)
	}
	if _, ok := result["total"]; !ok {
		t.Errorf("expected total key in output, got %v", result)
	}
}

func TestCmdHistoryLsNotInitialized(t *testing.T) {
	dir := t.TempDir()
	oldDir, _ := os.Getwd()
	os.Chdir(dir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "history", "ls")
	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_INITIALIZED")) {
		t.Errorf("expected NOT_INITIALIZED, got: %s", stderr)
	}
}

func TestCmdHistoryShowNotInitialized(t *testing.T) {
	dir := t.TempDir()
	oldDir, _ := os.Getwd()
	os.Chdir(dir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "history", "show", "1")
	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_INITIALIZED")) {
		t.Errorf("expected NOT_INITIALIZED, got: %s", stderr)
	}
}

func TestCmdHistoryDelNotInitialized(t *testing.T) {
	dir := t.TempDir()
	oldDir, _ := os.Getwd()
	os.Chdir(dir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "history", "del", "1")
	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_INITIALIZED")) {
		t.Errorf("expected NOT_INITIALIZED, got: %s", stderr)
	}
}

func TestCmdBuildNoLLM(t *testing.T) {
	setupTestKB(t)
	t.Setenv("MINDSTACK_CONFIG_DIR", t.TempDir())
	_, stderr, code := runCmd(t, "build")
	if code != 3 {
		t.Fatalf("expected exit code 3, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("LLM_UNAVAILABLE")) {
		t.Errorf("expected LLM_UNAVAILABLE, got: %s", stderr)
	}
}

func TestCmdBuildNotInitialized(t *testing.T) {
	dir := t.TempDir()
	oldDir, _ := os.Getwd()
	os.Chdir(dir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "build")
	if code != 2 {
		t.Fatalf("expected exit code 2, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_INITIALIZED")) {
		t.Errorf("expected NOT_INITIALIZED, got: %s", stderr)
	}
}




func TestCmdKBAmbiguous(t *testing.T) {
	tmpDir := t.TempDir()

	// Create two KBs
	for _, name := range []string{"kb1", "kb2"} {
		kbDir := filepath.Join(tmpDir, name)
		kbInner := filepath.Join(kbDir, ".mindstack")
		os.MkdirAll(kbInner, 0755)
		cfg := config.DefaultConfig()
		cfg.Name = name
		config.SaveConfig(filepath.Join(kbInner, "config.yaml"), cfg)
	}

	// Create project linking to both KBs
	projectDir := filepath.Join(tmpDir, "project")
	projInner := filepath.Join(projectDir, ".mindstack")
	os.MkdirAll(projInner, 0755)
	projCfg := fmt.Sprintf("knowledge_bases:\n  - %q\n  - %q\n",
		filepath.Join(tmpDir, "kb1"), filepath.Join(tmpDir, "kb2"))
	os.WriteFile(filepath.Join(projInner, "config.yaml"), []byte(projCfg), 0644)

	oldDir, _ := os.Getwd()
	os.Chdir(projectDir)
	t.Cleanup(func() { os.Chdir(oldDir) })

	_, stderr, code := runCmd(t, "doc", "ls")
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("KB_AMBIGUOUS")) {
		t.Errorf("expected KB_AMBIGUOUS, got: %s", stderr)
	}
}

// --- history command (data tests) ---

// setupTestDB creates an isolated SQLite database for history tests.
// It resets the db singleton and sets a new one pointing at a temp file.
func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db.Reset()

	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")
	d, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() {
		db.Reset()
	})

	db.SetInstance(d)
	return d
}

func TestCmdHistoryShowFound(t *testing.T) {
	dir := setupTestKB(t)
	d := setupTestDB(t)

	// resolveSymlinks returns the real path (macOS /var -> /private/var)
	resolveSymlinks := func(p string) string {
		r, err := filepath.EvalSymlinks(p)
		if err != nil {
			t.Fatalf("eval symlinks: %v", err)
		}
		return r
	}
	realDir := resolveSymlinks(dir)

	store := chat.NewStore(d)
	if err := store.AutoMigrate(); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	session, err := store.CreateSession(realDir, "Test Session")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}
	if _, err := store.AddMessage(session.ID, "user", "test query"); err != nil {
		t.Fatalf("add user message: %v", err)
	}
	if _, err := store.AddMessage(session.ID, "assistant", `{"answer":"hello"}`); err != nil {
		t.Fatalf("add assistant message: %v", err)
	}

	stdout, stderr, code := runCmd(t, "history", "show", strconv.FormatUint(uint64(session.ID), 10))
	if code != 0 {
		t.Fatalf("exit code %d, stderr: %s", code, stderr)
	}
	result := cmdParseJSON(stdout)
	if result["id"] == nil {
		t.Error("expected id field")
	}
	if result["title"] == nil {
		t.Error("expected title field")
	}
	if result["query"] != "test query" {
		t.Errorf("query = %v, want 'test query'", result["query"])
	}
	if result["result"] == nil {
		t.Error("expected result field")
	}
}

func TestCmdHistoryShowWrongWorkspace(t *testing.T) {
	_ = setupTestKB(t)
	d := setupTestDB(t)

	store := chat.NewStore(d)
	if err := store.AutoMigrate(); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	session, err := store.CreateSession("/other/workspace", "Other Session")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	_, stderr, code := runCmd(t, "history", "show", strconv.FormatUint(uint64(session.ID), 10))
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_FOUND")) {
		t.Errorf("expected NOT_FOUND, got: %s", stderr)
	}
}

func TestCmdHistoryDelFound(t *testing.T) {
	dir := setupTestKB(t)
	d := setupTestDB(t)

	realDir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatalf("eval symlinks: %v", err)
	}

	store := chat.NewStore(d)
	if err := store.AutoMigrate(); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	session, err := store.CreateSession(realDir, "Delete Me")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	stdout, stderr, code := runCmd(t, "history", "del", strconv.FormatUint(uint64(session.ID), 10))
	if code != 0 {
		t.Fatalf("exit code %d, stderr: %s", code, stderr)
	}
	result := cmdParseJSON(stdout)
	if result["deleted"] != true {
		t.Errorf("expected deleted=true, got %v", result["deleted"])
	}
}

func TestCmdHistoryDelWrongWorkspace(t *testing.T) {
	_ = setupTestKB(t)
	d := setupTestDB(t)

	store := chat.NewStore(d)
	if err := store.AutoMigrate(); err != nil {
		t.Fatalf("auto migrate: %v", err)
	}

	session, err := store.CreateSession("/other/workspace", "Other Session")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	_, stderr, code := runCmd(t, "history", "del", strconv.FormatUint(uint64(session.ID), 10))
	if code != 1 {
		t.Fatalf("expected exit code 1, got %d", code)
	}
	if !bytes.Contains([]byte(stderr), []byte("NOT_FOUND")) {
		t.Errorf("expected NOT_FOUND, got: %s", stderr)
	}
}
