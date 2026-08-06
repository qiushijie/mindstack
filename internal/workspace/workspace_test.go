package workspace

import (
	"os"
	"path/filepath"
	"testing"

	"mindstack/internal/config"
)

// useRegistry isolates the global KB registry to a temp config file.
func useRegistry(t *testing.T) {
	t.Helper()
	config.SetCustomConfigPath(filepath.Join(t.TempDir(), "config.json"))
	t.Cleanup(func() { config.SetCustomConfigPath("") })
}

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
	useRegistry(t)

	project := t.TempDir()
	kbPath := filepath.Join(t.TempDir(), "kb")

	// Init the KB with a name
	kbCfgDir := filepath.Join(kbPath, KnowledgeBaseDir)
	os.MkdirAll(kbCfgDir, 0755)
	kbCfg := config.DefaultConfig()
	kbCfg.Name = "shared-docs"
	config.SaveConfig(filepath.Join(kbCfgDir, "config.yaml"), kbCfg)

	// Register the KB name in the global registry
	if err := config.RegisterKnowledgeBase("shared-docs", kbPath); err != nil {
		t.Fatalf("register error: %v", err)
	}

	// Link project to KB via mindstack.yaml
	config.SaveConfig(filepath.Join(project, ProjectConfigFile), &config.Config{
		Version:        "1",
		KnowledgeBases: []string{"shared-docs"},
	})

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
	useRegistry(t)

	project := t.TempDir()

	// Create and register two KBs
	for _, name := range []string{"kb-a", "kb-b"} {
		kbPath := filepath.Join(t.TempDir(), name)
		kbCfgDir := filepath.Join(kbPath, KnowledgeBaseDir)
		os.MkdirAll(kbCfgDir, 0755)
		cfg := config.DefaultConfig()
		cfg.Name = name
		config.SaveConfig(filepath.Join(kbCfgDir, "config.yaml"), cfg)

		if err := config.RegisterKnowledgeBase(name, kbPath); err != nil {
			t.Fatalf("register error: %v", err)
		}
	}

	config.SaveConfig(filepath.Join(project, ProjectConfigFile), &config.Config{
		Version:        "1",
		KnowledgeBases: []string{"kb-a", "kb-b"},
	})

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

func TestResolveKnowledgeBases_UnregisteredName(t *testing.T) {
	useRegistry(t)

	project := t.TempDir()
	config.SaveConfig(filepath.Join(project, ProjectConfigFile), &config.Config{
		Version:        "1",
		KnowledgeBases: []string{"ghost"},
	})

	_, err := ResolveKnowledgeBases(project)
	if err == nil {
		t.Fatal("expected error for unregistered KB name")
	}
}

func TestResolveKnowledgeBases_RegisteredPathNotAKB(t *testing.T) {
	useRegistry(t)

	project := t.TempDir()

	// Register a name pointing at a dir that is not a knowledge base
	notKB := t.TempDir()
	if err := config.RegisterKnowledgeBase("stale", notKB); err != nil {
		t.Fatalf("register error: %v", err)
	}

	config.SaveConfig(filepath.Join(project, ProjectConfigFile), &config.Config{
		Version:        "1",
		KnowledgeBases: []string{"stale"},
	})

	_, err := ResolveKnowledgeBases(project)
	if err == nil {
		t.Fatal("expected error for registered path that is not a KB")
	}
}

func TestResolveKnowledgeBases_BothMarkersPrefersSelf(t *testing.T) {
	useRegistry(t)

	// A KB dir that also contains a stray mindstack.yaml must resolve as the
	// KB itself, matching FindKnowledgeBase priority.
	dir := t.TempDir()
	kbDir := filepath.Join(dir, KnowledgeBaseDir)
	os.MkdirAll(kbDir, 0755)
	cfg := config.DefaultConfig()
	cfg.Name = "self-kb"
	config.SaveConfig(filepath.Join(kbDir, "config.yaml"), cfg)
	config.SaveConfig(filepath.Join(dir, ProjectConfigFile), &config.Config{
		Version:        "1",
		KnowledgeBases: []string{"other-kb"},
	})

	kbs, err := ResolveKnowledgeBases(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(kbs) != 1 {
		t.Fatalf("expected 1, got %d", len(kbs))
	}
	if kbs[0].Name != "self-kb" {
		t.Fatalf("expected name 'self-kb', got %s", kbs[0].Name)
	}
	if kbs[0].Path != dir {
		t.Fatalf("expected path %s, got %s", dir, kbs[0].Path)
	}
}

func TestResolveKnowledgeBases_DuplicateNames(t *testing.T) {
	useRegistry(t)

	project := t.TempDir()
	kbPath := filepath.Join(t.TempDir(), "kb")

	kbCfgDir := filepath.Join(kbPath, KnowledgeBaseDir)
	os.MkdirAll(kbCfgDir, 0755)
	kbCfg := config.DefaultConfig()
	kbCfg.Name = "shared-docs"
	config.SaveConfig(filepath.Join(kbCfgDir, "config.yaml"), kbCfg)

	if err := config.RegisterKnowledgeBase("shared-docs", kbPath); err != nil {
		t.Fatalf("register error: %v", err)
	}

	// A hand-edited mindstack.yaml may list the same name twice.
	config.SaveConfig(filepath.Join(project, ProjectConfigFile), &config.Config{
		Version:        "1",
		KnowledgeBases: []string{"shared-docs", "shared-docs"},
	})

	kbs, err := ResolveKnowledgeBases(project)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(kbs) != 1 {
		t.Fatalf("expected 1 deduplicated KB, got %d", len(kbs))
	}
	if kbs[0].Name != "shared-docs" {
		t.Fatalf("expected name 'shared-docs', got %s", kbs[0].Name)
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

func TestFindKnowledgeBase_ProjectLink(t *testing.T) {
	dir := t.TempDir()
	config.SaveConfig(filepath.Join(dir, ProjectConfigFile), &config.Config{
		Version:        "1",
		KnowledgeBases: []string{"shared-docs"},
	})

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
