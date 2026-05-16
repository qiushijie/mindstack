//go:build e2e

package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// --- shared binary path (built once in TestMain) ---

var e2eBinary string

func TestMain(m *testing.M) {
	tmpFile, err := os.CreateTemp("", "mindstack-e2e-*")
	if err != nil {
		fmt.Fprintf(os.Stderr, "cannot create temp file: %v\n", err)
		os.Exit(1)
	}
	e2eBinary = tmpFile.Name()
	tmpFile.Close()

	_, filename, _, _ := runtime.Caller(0)
	cliDir := filepath.Dir(filename)

	build := exec.Command("go", "build", "-o", e2eBinary, ".")
	build.Dir = cliDir
	if output, err := build.CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "build failed: %v\n%s\n", err, output)
		os.Exit(1)
	}

	code := m.Run()
	os.Remove(e2eBinary)
	os.Exit(code)
}

// --- helpers ---

func e2eRun(dir string, stdin string, args ...string) (stdout, stderr string, exitCode int) {
	cmd := exec.Command(e2eBinary, args...)
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

func e2eJSON(s string) map[string]interface{} {
	var result map[string]interface{}
	if err := json.Unmarshal([]byte(s), &result); err != nil {
		return nil
	}
	return result
}

func e2eMustJSON(t *testing.T, s string) map[string]interface{} {
	t.Helper()
	result := e2eJSON(s)
	if result == nil {
		t.Fatalf("invalid JSON: %q", s)
	}
	return result
}

// setupFixtureKB copies testdata/workspace to a temp dir, inits KB, copies meta+relations.
// Returns the KB root path.
func setupFixtureKB(t *testing.T) string {
	t.Helper()
	_, filename, _, _ := runtime.Caller(0)
	fixtureDir := filepath.Join(filepath.Dir(filename), "testdata", "workspace")

	kbDir := t.TempDir()

	// Copy all files except .mindstack (we init fresh and copy data files separately)
	filepath.WalkDir(fixtureDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(fixtureDir, path)
		if rel == ".mindstack" {
			return filepath.SkipDir
		}
		target := filepath.Join(kbDir, rel)
		if d.IsDir() {
			os.MkdirAll(target, 0755)
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0644)
	})

	// Init knowledge base
	stdout, _, code := e2eRun("", "", "init", kbDir)
	if code != 0 {
		t.Fatalf("init failed (code %d): %s", code, stdout)
	}

	// Copy pre-built meta.json and relations.json
	for _, name := range []string{"meta.json", "relations.json"} {
		src := filepath.Join(fixtureDir, ".mindstack", name)
		data, err := os.ReadFile(src)
		if err != nil {
			t.Fatalf("read fixture %s: %v", name, err)
		}
		dst := filepath.Join(kbDir, ".mindstack", name)
		if err := os.WriteFile(dst, data, 0644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	return kbDir
}

// setupLinkedProject creates a project dir and links the KB to it.
// Returns (projectDir, kbName) where kbName can be used with --kb flag.
func setupLinkedProject(t *testing.T, kbDir string) (string, string) {
	t.Helper()
	projectDir := t.TempDir()
	stdout, _, code := e2eRun(projectDir, "", "link", kbDir)
	if code != 0 {
		t.Fatalf("link failed (code %d): %s", code, stdout)
	}
	result := e2eMustJSON(t, stdout)
	kbName := strVal(result["name"])
	return projectDir, kbName
}

func floatVal(v interface{}) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0
}

func intVal(v interface{}) int {
	return int(floatVal(v))
}

func strVal(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// --- Full workflow test ---

func TestE2E_FullWorkflow(t *testing.T) {
	kbDir := setupFixtureKB(t)

	t.Run("info", func(t *testing.T) {
		stdout, _, code := e2eRun(kbDir, "", "info")
		if code != 0 {
			t.Fatalf("exit %d: %s", code, stdout)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["documentCount"]) != 7 {
			t.Errorf("documentCount = %v, want 7", result["documentCount"])
		}
		if intVal(result["relationCount"]) != 8 {
			t.Errorf("relationCount = %v, want 8", result["relationCount"])
		}
	})

	t.Run("ls_all", func(t *testing.T) {
		stdout, _, code := e2eRun(kbDir, "", "doc", "ls")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		// 2 dirs (api, guides) + 3 root md + 2 api/ md + 2 guides/ md = 9
		total := intVal(result["total"])
		if total != 9 {
			docs := result["documents"].([]interface{})
			t.Errorf("total = %d, want 9; docs: %v", total, docs)
		}
	})

	t.Run("ls_prefix", func(t *testing.T) {
		stdout, _, code := e2eRun(kbDir, "", "doc", "ls", "api")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["total"]) != 2 {
			t.Errorf("api/ total = %v, want 2", result["total"])
		}
	})

	t.Run("meta_found", func(t *testing.T) {
		stdout, _, code := e2eRun(kbDir, "", "doc", "meta", filepath.Join(kbDir, "api/rest.md"))
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if result["found"] != true {
			t.Fatal("expected found=true")
		}
		if strVal(result["title"]) != "REST API Reference" {
			t.Errorf("title = %v", result["title"])
		}
		tags, _ := result["tags"].([]interface{})
		if len(tags) != 3 {
			t.Errorf("tags count = %d, want 3", len(tags))
		}
		if strVal(result["status"]) != "published" {
			t.Errorf("status = %v", result["status"])
		}
	})

	t.Run("meta_not_found", func(t *testing.T) {
		// A file that exists on disk but has no meta entry
		stdout, _, code := e2eRun(kbDir, "", "doc", "meta", filepath.Join(kbDir, "README.md"))
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		// README.md has meta, so this should be found
		result := e2eMustJSON(t, stdout)
		if result["found"] != true {
			t.Errorf("README.md should have meta, got found=%v", result["found"])
		}
	})

	t.Run("tags", func(t *testing.T) {
		stdout, _, code := e2eRun(kbDir, "", "tags")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		totalTags := intVal(result["totalTags"])
		if totalTags == 0 {
			t.Fatal("expected some tags")
		}

		// "documentation" tag should be on 4 docs: README, getting-started, architecture, testing
		tags := result["tags"].([]interface{})
		for _, tag := range tags {
			tagMap := tag.(map[string]interface{})
			if strVal(tagMap["name"]) == "documentation" {
				if intVal(tagMap["count"]) != 4 {
					t.Errorf("documentation count = %v, want 4", tagMap["count"])
				}
				}
		}
	})

	t.Run("relation_outgoing", func(t *testing.T) {
		// README.md has 2 outgoing relations
		stdout, _, code := e2eRun(kbDir, "", "doc", "relation", filepath.Join(kbDir, "README.md"))
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["totalOutgoing"]) != 2 {
			t.Errorf("outgoing = %v, want 2", result["totalOutgoing"])
		}
		if intVal(result["totalIncoming"]) != 0 {
			t.Errorf("incoming = %v, want 0", result["totalIncoming"])
		}
	})

	t.Run("relation_incoming", func(t *testing.T) {
		// architecture.md is targeted by README.md and deployment.md
		stdout, _, code := e2eRun(kbDir, "", "doc", "relation", filepath.Join(kbDir, "architecture.md"))
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["totalIncoming"]) != 2 {
			t.Errorf("incoming = %v, want 2", result["totalIncoming"])
		}
	})

	t.Run("relation_bidirectional", func(t *testing.T) {
		// api/rest.md has 1 outgoing (→ graphql) and 1 incoming (← graphql, ← getting-started)
		stdout, _, code := e2eRun(kbDir, "", "doc", "relation", filepath.Join(kbDir, "api/rest.md"))
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		outgoing := intVal(result["totalOutgoing"])
		incoming := intVal(result["totalIncoming"])
		if outgoing != 1 {
			t.Errorf("outgoing = %d, want 1", outgoing)
		}
		if incoming != 2 {
			t.Errorf("incoming = %d, want 2", incoming)
		}
	})
}

// --- Multi-document search tests ---

func TestE2E_MultiDocSearch(t *testing.T) {
	kbDir := setupFixtureKB(t)

	t.Run("fulltext_multiple_hits", func(t *testing.T) {
		// "knowledge base" appears in multiple docs
		stdout, _, code := e2eRun(kbDir, "", "search", "--fulltext", "knowledge base")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if result["mode"] != "fulltext" {
			t.Errorf("mode = %v", result["mode"])
		}
		total := intVal(result["total"])
		if total < 2 {
			t.Errorf("expected >= 2 results for 'knowledge base', got %d", total)
		}
	})

	t.Run("fulltext_specific_term", func(t *testing.T) {
		// "graphql" only in graphql.md and rest.md
		stdout, _, code := e2eRun(kbDir, "", "search", "--fulltext", "graphql")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		results := result["results"].([]interface{})
		paths := map[string]bool{}
		for _, r := range results {
			rm := r.(map[string]interface{})
			paths[strVal(rm["path"])] = true
		}
		if !paths[filepath.Join(kbDir, "api/graphql.md")] {
			t.Error("expected api/graphql.md in results")
		}
	})

	t.Run("fulltext_case_insensitive", func(t *testing.T) {
		// "MINDSTACK" should match "mindstack" in content
		stdout, _, code := e2eRun(kbDir, "", "search", "--fulltext", "MINDSTACK")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["total"]) == 0 {
			t.Error("case-insensitive search should find results")
		}
	})

	t.Run("fulltext_no_results", func(t *testing.T) {
		stdout, _, code := e2eRun(kbDir, "", "search", "--fulltext", "zzz_nonexistent_xyzzy")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["total"]) != 0 {
			t.Errorf("expected 0 results, got %v", result["total"])
		}
	})

	t.Run("tag_shared_across_docs", func(t *testing.T) {
		// "api" tag is on both rest.md and graphql.md
		stdout, _, code := e2eRun(kbDir, "", "search", "api")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if result["mode"] != "tag" {
			t.Errorf("mode = %v, want tag", result["mode"])
		}
		if intVal(result["total"]) != 2 {
			t.Errorf("expected 2 docs with 'api' tag, got %v", result["total"])
		}
	})

	t.Run("tag_unique", func(t *testing.T) {
		// "graphql" tag is only on graphql.md
		stdout, _, code := e2eRun(kbDir, "", "search", "graphql")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["total"]) != 1 {
			t.Errorf("expected 1 doc with 'graphql' tag, got %v", result["total"])
		}
	})

	t.Run("tag_not_found", func(t *testing.T) {
		stdout, _, code := e2eRun(kbDir, "", "search", "nonexistent")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["total"]) != 0 {
			t.Errorf("expected 0 results, got %v", result["total"])
		}
	})
}

// --- Link workflow test ---

func TestE2E_LinkWorkflow(t *testing.T) {
	kbDir := setupFixtureKB(t)
	projectDir, kbName := setupLinkedProject(t, kbDir)

	t.Run("ls_via_kb_flag", func(t *testing.T) {
		stdout, _, code := e2eRun(projectDir, "", "--kb", kbName, "doc", "ls")
		if code != 0 {
			t.Fatalf("exit %d: %s", code, stdout)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["total"]) == 0 {
			t.Error("expected documents in linked KB")
		}
	})

	t.Run("search_via_kb_flag", func(t *testing.T) {
		stdout, _, code := e2eRun(projectDir, "", "--kb", kbName, "search", "api")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["total"]) == 0 {
			t.Error("expected search results via --kb")
		}
	})

	t.Run("info_via_kb_flag", func(t *testing.T) {
		stdout, _, code := e2eRun(projectDir, "", "--kb", kbName, "info")
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if intVal(result["documentCount"]) != 7 {
			t.Errorf("documentCount = %v, want 7", result["documentCount"])
		}
	})

	t.Run("link_with_name", func(t *testing.T) {
		// Set a name on the KB so --kb can match it
		configPath := filepath.Join(kbDir, ".mindstack", "config.yaml")
		os.WriteFile(configPath, []byte("name: my-kb\nversion: \"1\"\n"), 0644)

		// Create a second project dir, link with custom name
		project2 := t.TempDir()
		stdout, _, code := e2eRun(project2, "", "link", kbDir)
		if code != 0 {
			t.Fatalf("exit %d", code)
		}
		result := e2eMustJSON(t, stdout)
		if strVal(result["name"]) != "my-kb" {
			t.Errorf("name = %v, want my-kb", result["name"])
		}

		// Use the name via --kb flag
		stdout2, _, code2 := e2eRun(project2, "", "--kb", "my-kb", "doc", "ls")
		if code2 != 0 {
			t.Fatalf("exit %d via --kb my-kb", code2)
		}
		result2 := e2eMustJSON(t, stdout2)
		if intVal(result2["total"]) == 0 {
			t.Error("expected docs via --kb my-kb")
		}
	})

	t.Run("kb_flag_not_found", func(t *testing.T) {
		_, stderr, code := e2eRun(projectDir, "", "--kb", "nonexistent", "doc", "ls")
		if code != 1 {
			t.Fatalf("expected exit 1, got %d", code)
		}
		if !strings.Contains(stderr, "KB_NOT_FOUND") {
			t.Errorf("expected KB_NOT_FOUND, got: %s", stderr)
		}
	})

	t.Run("not_initialized", func(t *testing.T) {
		emptyDir := t.TempDir()
		_, stderr, code := e2eRun(emptyDir, "", "doc", "ls")
		if code != 2 {
			t.Fatalf("expected exit 2, got %d", code)
		}
		if !strings.Contains(stderr, "NOT_INITIALIZED") {
			t.Errorf("expected NOT_INITIALIZED, got: %s", stderr)
		}
	})
}

// --- Info accuracy with fixture data ---

func TestE2E_InfoAccuracy(t *testing.T) {
	kbDir := setupFixtureKB(t)

	stdout, _, code := e2eRun(kbDir, "", "info")
	if code != 0 {
		t.Fatalf("exit %d", code)
	}
	result := e2eMustJSON(t, stdout)

	t.Run("document_count_matches_meta", func(t *testing.T) {
		// meta.json has 7 entries
		if intVal(result["documentCount"]) != 7 {
			t.Errorf("documentCount = %v, want 7", result["documentCount"])
		}
	})

	t.Run("relation_count_matches_fixture", func(t *testing.T) {
		// relations.json has 8 total relations
		if intVal(result["relationCount"]) != 8 {
			t.Errorf("relationCount = %v, want 8", result["relationCount"])
		}
	})

	t.Run("knowledge_bases_self_referential", func(t *testing.T) {
		// A direct KB (not a link) resolves to itself in knowledgeBases
		kbs, _ := result["knowledgeBases"].([]interface{})
		if len(kbs) != 1 {
			t.Fatalf("expected 1 KB entry (self), got %v", kbs)
		}
		kb := kbs[0].(map[string]interface{})
		if strVal(kb["path"]) != kbDir {
			t.Errorf("KB path = %v, want %v", kb["path"], kbDir)
		}
	})

	t.Run("after_write_info_count_unchanged", func(t *testing.T) {
		// Write a new file without meta entry
		os.WriteFile(filepath.Join(kbDir, "new.md"), []byte("# New doc"), 0644)

		stdout2, _, _ := e2eRun(kbDir, "", "info")
		result2 := e2eMustJSON(t, stdout2)
		// documentCount is based on meta.json, not filesystem
		if intVal(result2["documentCount"]) != 7 {
			t.Errorf("documentCount changed after write: %v (should still be 7 from meta)", result2["documentCount"])
		}
	})
}

// --- Cross-document relation traversal ---

func TestE2E_RelationTraversal(t *testing.T) {
	kbDir := setupFixtureKB(t)

	t.Run("traverse_readme_to_api", func(t *testing.T) {
		// README → getting-started → api/rest → api/graphql
		// Step 1: README.md relations
		stdout, _, _ := e2eRun(kbDir, "", "doc", "relation", filepath.Join(kbDir, "README.md"))
		readmeResult := e2eMustJSON(t, stdout)
		outgoing := readmeResult["outgoing"].([]interface{})
		if len(outgoing) == 0 {
			t.Fatal("README should have outgoing relations")
		}

		// Step 2: getting-started.md relations
		stdout2, _, _ := e2eRun(kbDir, "", "doc", "relation", filepath.Join(kbDir, "getting-started.md"))
		gsResult := e2eMustJSON(t, stdout2)
		gsOutgoing := gsResult["outgoing"].([]interface{})
		if len(gsOutgoing) == 0 {
			t.Fatal("getting-started should have outgoing relations")
		}

		// Verify chain: getting-started → api/rest.md
		foundRestLink := false
		for _, r := range gsOutgoing {
			rm := r.(map[string]interface{})
			if strVal(rm["target"]) == filepath.Join(kbDir, "api/rest.md") {
				foundRestLink = true
				if floatVal(rm["score"]) < 0.5 {
					t.Errorf("unexpected low score: %v", rm["score"])
				}
			}
		}
		if !foundRestLink {
			t.Error("expected getting-started → api/rest.md relation")
		}
	})

	t.Run("traverse_mutual_rest_graphql", func(t *testing.T) {
		// rest ↔ graphql (mutual relation)
		stdout, _, _ := e2eRun(kbDir, "", "doc", "relation", filepath.Join(kbDir, "api/rest.md"))
		restResult := e2eMustJSON(t, stdout)

		stdout2, _, _ := e2eRun(kbDir, "", "doc", "relation", filepath.Join(kbDir, "api/graphql.md"))
		gqlResult := e2eMustJSON(t, stdout2)

		// rest → graphql
		restOutgoing := restResult["outgoing"].([]interface{})
		hasGqlTarget := false
		for _, r := range restOutgoing {
			rm := r.(map[string]interface{})
			if strVal(rm["target"]) == filepath.Join(kbDir, "api/graphql.md") {
				hasGqlTarget = true
			}
		}
		if !hasGqlTarget {
			t.Error("expected rest → graphql relation")
		}

		// graphql → rest
		gqlOutgoing := gqlResult["outgoing"].([]interface{})
		hasRestTarget := false
		for _, r := range gqlOutgoing {
			rm := r.(map[string]interface{})
			if strVal(rm["target"]) == filepath.Join(kbDir, "api/rest.md") {
				hasRestTarget = true
			}
		}
		if !hasRestTarget {
			t.Error("expected graphql → rest relation")
		}
	})
}

// --- Error scenarios in realistic context ---

func TestE2E_ErrorScenarios(t *testing.T) {
	kbDir := setupFixtureKB(t)

	t.Run("init_already_exists", func(t *testing.T) {
		_, stderr, code := e2eRun("", "", "init", kbDir)
		if code != 1 {
			t.Fatalf("expected exit 1, got %d", code)
		}
		if !strings.Contains(stderr, "ALREADY_EXISTS") {
			t.Errorf("expected ALREADY_EXISTS, got: %s", stderr)
		}
	})

	t.Run("link_not_a_kb", func(t *testing.T) {
		notKB := t.TempDir()
		projectDir := t.TempDir()
		_, stderr, code := e2eRun(projectDir, "", "link", notKB)
		if code != 1 {
			t.Fatalf("expected exit 1, got %d", code)
		}
		if !strings.Contains(stderr, "NOT_A_KB") {
			t.Errorf("expected NOT_A_KB, got: %s", stderr)
		}
	})

	t.Run("link_already_linked", func(t *testing.T) {
		projectDir, _ := setupLinkedProject(t, kbDir)
		_, stderr, code := e2eRun(projectDir, "", "link", kbDir)
		if code != 1 {
			t.Fatalf("expected exit 1, got %d", code)
		}
		if !strings.Contains(stderr, "ALREADY_LINKED") {
			t.Errorf("expected ALREADY_LINKED, got: %s", stderr)
		}
	})
}
