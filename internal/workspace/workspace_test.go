package workspace

import (
	"os"
	"path/filepath"
	"testing"

	"mindstack/internal/config"
)

func TestValidatePath_Normal(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "sub", "file.md")
	os.MkdirAll(filepath.Dir(target), 0755)
	os.WriteFile(target, []byte(""), 0644)

	if err := ValidatePath(root, target); err != nil {
		t.Fatalf("expected valid, got %v", err)
	}
}

func TestValidatePath_Escape(t *testing.T) {
	root := t.TempDir()
	escape := filepath.Join(root, "..", "..", "etc", "passwd")

	if err := ValidatePath(root, escape); err == nil {
		t.Fatal("expected error for path escape")
	}
}

func TestValidatePath_Relative(t *testing.T) {
	if err := ValidatePath("/tmp", "relative/path"); err == nil {
		t.Fatal("expected error for relative path")
	}
}

func TestIsKnowledgeBaseInit_True(t *testing.T) {
	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, KnowledgeBaseDir), 0755)

	if !IsKnowledgeBaseInit(dir) {
		t.Fatal("expected true")
	}
}

func TestIsKnowledgeBaseInit_False(t *testing.T) {
	dir := t.TempDir()

	if IsKnowledgeBaseInit(dir) {
		t.Fatal("expected false")
	}
}

func TestFindKnowledgeBase_CurrentDir(t *testing.T) {
	dir := t.TempDir()
	kbDir := filepath.Join(dir, KnowledgeBaseDir)
	os.MkdirAll(kbDir, 0755)
	config.SaveConfig(filepath.Join(kbDir, "config.yaml"), config.DefaultConfig())

	found, err := FindKnowledgeBase(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found != dir {
		t.Fatalf("expected %s, got %s", dir, found)
	}
}

func TestFindKnowledgeBase_ParentDir(t *testing.T) {
	dir := t.TempDir()
	kbDir := filepath.Join(dir, KnowledgeBaseDir)
	os.MkdirAll(kbDir, 0755)
	config.SaveConfig(filepath.Join(kbDir, "config.yaml"), config.DefaultConfig())

	child := filepath.Join(dir, "subdir")
	os.MkdirAll(child, 0755)

	found, err := FindKnowledgeBase(child)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if found != dir {
		t.Fatalf("expected %s, got %s", dir, found)
	}
}

func TestFindKnowledgeBase_NotFound(t *testing.T) {
	dir := t.TempDir()

	_, err := FindKnowledgeBase(dir)
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestResolveKnowledgeBases_Self(t *testing.T) {
	dir := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Name = "my-kb"
	kbDir := filepath.Join(dir, KnowledgeBaseDir)
	os.MkdirAll(kbDir, 0755)
	config.SaveConfig(filepath.Join(kbDir, "config.yaml"), cfg)

	kbs, err := ResolveKnowledgeBases(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(kbs) != 1 {
		t.Fatalf("expected 1, got %d", len(kbs))
	}
	if kbs[0].Name != "my-kb" {
		t.Fatalf("expected name 'my-kb', got %s", kbs[0].Name)
	}
	if kbs[0].Path != dir {
		t.Fatalf("expected path %s, got %s", dir, kbs[0].Path)
	}
}

func TestResolveKnowledgeBases_Linked(t *testing.T) {
	project := t.TempDir()
	kbPath := filepath.Join(t.TempDir(), "kb")
	os.MkdirAll(kbPath, 0755)

	// Init the KB with a name
	kbCfgDir := filepath.Join(kbPath, KnowledgeBaseDir)
	os.MkdirAll(kbCfgDir, 0755)
	kbCfg := config.DefaultConfig()
	kbCfg.Name = "shared-docs"
	config.SaveConfig(filepath.Join(kbCfgDir, "config.yaml"), kbCfg)

	// Link project to KB
	linkCfgDir := filepath.Join(project, KnowledgeBaseDir)
	os.MkdirAll(linkCfgDir, 0755)
	config.SaveConfig(filepath.Join(linkCfgDir, "config.yaml"), &config.Config{KnowledgeBases: []string{kbPath}})

	kbs, err := ResolveKnowledgeBases(project)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(kbs) != 1 {
		t.Fatalf("expected 1, got %d", len(kbs))
	}
	if kbs[0].Name != "shared-docs" {
		t.Fatalf("expected name 'shared-docs', got %s", kbs[0].Name)
	}
	if kbs[0].Path != kbPath {
		t.Fatalf("expected path %s, got %s", kbPath, kbs[0].Path)
	}
}

func TestResolveKnowledgeBases_Multiple(t *testing.T) {
	project := t.TempDir()

	// Create two KBs
	for _, name := range []string{"kb-a", "kb-b"} {
		kbPath := filepath.Join(t.TempDir(), name)
		os.MkdirAll(kbPath, 0755)
		kbCfgDir := filepath.Join(kbPath, KnowledgeBaseDir)
		os.MkdirAll(kbCfgDir, 0755)
		cfg := config.DefaultConfig()
		cfg.Name = name
		config.SaveConfig(filepath.Join(kbCfgDir, "config.yaml"), cfg)
	}

	kbA := filepath.Join(t.TempDir(), "kb-a")
	kbB := filepath.Join(t.TempDir(), "kb-b")

	linkCfgDir := filepath.Join(project, KnowledgeBaseDir)
	os.MkdirAll(linkCfgDir, 0755)
	config.SaveConfig(filepath.Join(linkCfgDir, "config.yaml"), &config.Config{KnowledgeBases: []string{kbA, kbB}})

	kbs, err := ResolveKnowledgeBases(project)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(kbs) != 2 {
		t.Fatalf("expected 2, got %d", len(kbs))
	}
	if kbs[0].Name != "kb-a" {
		t.Fatalf("expected name 'kb-a', got %s", kbs[0].Name)
	}
	if kbs[1].Name != "kb-b" {
		t.Fatalf("expected name 'kb-b', got %s", kbs[1].Name)
	}
}

func TestResolveFirstKnowledgeBase(t *testing.T) {
	dir := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.Name = "test-kb"
	kbDir := filepath.Join(dir, KnowledgeBaseDir)
	os.MkdirAll(kbDir, 0755)
	config.SaveConfig(filepath.Join(kbDir, "config.yaml"), cfg)

	path, err := ResolveFirstKnowledgeBase(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if path != dir {
		t.Fatalf("expected %s, got %s", dir, path)
	}
}

func TestResolveKnowledgeBases_LegacySingleLink(t *testing.T) {
	project := t.TempDir()
	kbPath := filepath.Join(t.TempDir(), "kb")
	os.MkdirAll(kbPath, 0755)

	kbCfgDir := filepath.Join(kbPath, KnowledgeBaseDir)
	os.MkdirAll(kbCfgDir, 0755)
	kbCfg := config.DefaultConfig()
	kbCfg.Name = "legacy-kb"
	config.SaveConfig(filepath.Join(kbCfgDir, "config.yaml"), kbCfg)

	// Use old single knowledge_base field
	linkCfgDir := filepath.Join(project, KnowledgeBaseDir)
	os.MkdirAll(linkCfgDir, 0755)
	config.SaveConfig(filepath.Join(linkCfgDir, "config.yaml"), &config.Config{KnowledgeBase: kbPath})

	kbs, err := ResolveKnowledgeBases(project)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(kbs) != 1 {
		t.Fatalf("expected 1, got %d", len(kbs))
	}
	if kbs[0].Name != "legacy-kb" {
		t.Fatalf("expected name 'legacy-kb', got %s", kbs[0].Name)
	}
}
