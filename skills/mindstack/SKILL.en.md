---
name: mindstack
description: MindStack CLI usage for AI codegen tools to operate on a markdown knowledge base, including document search, metadata management, relation analysis, and LLM build
---

# MindStack CLI Usage Guide

## Triggers

Activate this skill when the user wants to operate on a knowledge base:

- Search document content or tags
- Ask a natural-language question and get retrieved snippets plus a synthesized answer
- View document metadata (title, summary, tags, status)
- View document relations
- Build the workspace (LLM-generated metadata and relations)
- View knowledge base overview
- Edit markdown documents

Keywords: `knowledge base` `mindstack` `document management` `document search` `document relations` `kb build` `kb` `markdown management`

## Prerequisites

Before any command, the current working directory (or one of its ancestors) must contain either `.mindstack/config.yaml` (a knowledge base created by `mindstack init`) or `mindstack.yaml` (a project linked to knowledge bases via `mindstack link`). When multiple knowledge bases are linked, use `--kb <name>` to select the target:

```bash
mindstack --kb kb1 doc ls
mindstack --kb kb2 doc meta /path/to/kb2/docs/example.md
```

When only a single knowledge base is linked, `--kb` may be omitted.

The `build` command requires the LLM service to be available; otherwise it returns `LLM_UNAVAILABLE` (exit code 3).

## Output Format

All commands write JSON to **stdout** and errors to **stderr**.

Error format:
```json
{"error": "error description", "code": "ERROR_CODE"}
```

Exit codes: 0 success, 1 user error, 2 not initialized, 3 LLM unavailable.

The `build` command emits per-line progress events (JSON) to stderr; the final result still goes to stdout.

## File I/O

**The CLI does not provide read, write, or edit commands.** All document paths returned by commands are absolute paths — operate on them directly with the Read/Write/Edit tools:

- Read a document: call the Read tool on the absolute path returned by `doc ls`, `search`, `doc meta`, `doc relation`, etc.
- Write a document: call the Write tool on the absolute path you want to create or overwrite.
- Edit a document: call the Edit tool on the absolute path.

## Command Reference

### Setup

#### `mindstack init`

Initializes the current directory as a knowledge base: creates `.mindstack/config.yaml` (name/description/version) and registers the KB name → local path mapping in the global `config.json` (`knowledgeBases` field). The global config defaults to `~/.mindstack/config.json`, but the actual path follows the CLI's config resolution priority and may fall back to the OS user config directory. The global config is machine-local and must not be committed to git.

```bash
mindstack init
```

#### `mindstack link <kb-path>`

Links the current project to a knowledge base. It registers the KB name → local path mapping in the global config (use `--name` to set an alias; if the name is already registered for a different path, it fails with `NAME_CONFLICT` — pick an alias with `--name`), then writes/appends `mindstack.yaml` in the project root:

```yaml
version: "1"
knowledge_bases:
  - my-kb
```

`mindstack.yaml` contains only KB names, no local paths, so it can and should be committed to git. Any clone of the same repository (e.g., a copy an AI codegen tool pulls into a different directory) can use the knowledge base as long as the name is registered in that machine's global config. If a name in `mindstack.yaml` is not registered locally (e.g., on a new machine), the error message tells you to run `mindstack link <kb-path>` to register it.

```bash
mindstack link /path/to/kb
mindstack link /path/to/kb --name my-alias
```

### Document Browsing

#### `mindstack info`

Shows the knowledge base overview.

```bash
mindstack info
```

Success output:
```json
{
  "root": "/path/to/kb",
  "name": "my-kb",
  "version": "1",
  "documentCount": 42,
  "relationCount": 15,
  "knowledgeBases": [{"name": "linked-kb", "path": "/path/to/linked"}]
}
```

`documentCount` counts documents that have metadata, which is not necessarily the same as the total number of markdown files on disk.

#### `mindstack doc ls [path]`

Lists markdown files (`.md` / `.markdown`) and directories. Directories first, sorted alphabetically. Hidden directories and `.mindstack/` are excluded.

```bash
mindstack doc ls
mindstack doc ls docs/
```

Success output:
```json
{
  "root": "/path/to/kb",
  "prefix": "docs/",
  "documents": [
    {"path": "/path/to/kb/docs/api/", "name": "api", "isDir": true},
    {"path": "/path/to/kb/docs/api/auth.md", "name": "auth.md", "isDir": false}
  ],
  "total": 2
}
```

### Search

#### `mindstack search <query>`

Search the knowledge base. The default mode is tag search (comma-separate multiple tags for AND filtering). Use `--mode` to switch between `tag`, `fulltext`, and `hybrid`. The legacy `--fulltext` flag is a deprecated alias for `--mode fulltext`.

```bash
# Tag search (default, case-insensitive, AND for multiple tags)
mindstack search "tutorial"
mindstack search "api,rest"

# Full-text search (case-insensitive, substring match)
mindstack search --mode fulltext "keyword"
# Deprecated alias:
mindstack search "keyword" --fulltext

# Hybrid search: combine tag and full-text recall, ranked by score
mindstack search --mode hybrid "api retry policy"
```

Output shape for every mode is a `ResultSet`:

```json
{
  "query": "api,rest",
  "mode": "tag",
  "results": [
    {
      "path": "/path/to/kb/docs/guide.md",
      "title": "Tutorial",
      "summary": "Guide summary",
      "tags": ["tutorial", "api", "rest"],
      "score": 15,
      "breakdown": {
        "tagHits": 2,
        "titleHits": 0,
        "summaryHits": 0,
        "headingHits": 0,
        "contentHits": 0
      },
      "matches": [
        {"line": 0, "text": "api", "term": "api", "source": "tag"}
      ]
    }
  ],
  "total": 1
}
```

`score` is the document relevance score. `breakdown` shows how the score was composed. `matches` lists individual term matches (line numbers refer to the original markdown file; `line: 0` indicates a tag match).

Error codes: `SEARCH_FAILED`.

### Search vs Q&A: When to Use Which

**`search` (tag/fulltext)**
- Pros: fast, no LLM dependency, works offline
- Cons: relies on tag and alias quality generated during build, no natural-language understanding, struggles with complex queries
- Best for: locating documents when you know the keyword or tag

**`ack` (LLM semantic retrieval)**
- Pros: understands natural-language questions, synthesizes evidence across documents, returns precise snippets with line numbers
- Cons: requires LLM availability, slower (multiple LLM calls), consumes tokens
- Best for: answering complex questions, cross-document analysis, extracting relevant passages

**Recommendation**: prefer `search` for quick lookups; use `ack` when search results are imprecise or you need synthesized analysis.

### Q&A

#### `mindstack ack <query>`

Use the LLM to retrieve relevant snippets from the knowledge base and synthesize an answer. Pipeline: LLM maps the question to existing tags → joint tag + full-text recall → LLM extracts line ranges from each candidate doc → top 5 snippets by relevance → LLM produces a single summary across all kept snippets. Requires a configured LLM (see `mindstack info`).

`<query>` must be passed as a single argument; quote multi-word queries.

```bash
mindstack ack "what is the api retry policy"
```

Output:
```json
{
  "query": "what is the api retry policy",
  "tags": ["api", "retry"],
  "summary": "API calls use exponential backoff with up to 3 attempts and a 30s timeout.",
  "snippets": [
    {
      "path": "/path/to/kb/docs/api.md",
      "startLine": 3,
      "endLine": 5,
      "content": "Retry uses exponential backoff.\nDefault 3 attempts.\nTimeout 30s.",
      "score": 0.9
    }
  ]
}
```

Field notes:
- `tags`: tags the LLM selected from the existing knowledge-base tag set (may be empty)
- `summary`: a single overall answer synthesized from all kept snippets (empty string when there are no snippets)
- `snippets`: ranked by relevance descending, capped at 5; each item carries an absolute path, 1-indexed start/end lines, the original lines, and a 0-1 relevance score

Error codes: `LLM_UNAVAILABLE` (exit 3, LLM not configured), `ACK_FAILED` (exit 1, execution failed).

### Metadata

#### `mindstack doc meta <path>`

Show document metadata. The path must be an **absolute path** (e.g., the `path` returned by `doc ls` or `search`) and the file must exist. Metadata is generated by `build` via the LLM.

```bash
mindstack doc meta /path/to/kb/docs/example.md
```

When metadata exists:
```json
{
  "path": "/path/to/kb/docs/example.md",
  "found": true,
  "title": "Example Document",
  "summary": "Document summary",
  "tags": ["tutorial", "getting-started"],
  "status": "active",
  "contentHash": "abc123..."
}
```

When metadata is missing:
```json
{
  "path": "/path/to/kb/docs/example.md",
  "found": false
}
```

Missing metadata exits 0; `found: false` means the document has not yet been processed by `build`.

#### `mindstack tags`

Lists all tags and their document counts, sorted by count descending.

```bash
mindstack tags
```

Success output:
```json
{
  "tags": [
    {"name": "tutorial", "count": 5},
    {"name": "api", "count": 3}
  ],
  "totalTags": 10,
  "totalDocuments": 42
}
```

### Document Relations

#### `mindstack doc relation <path>`

Shows incoming and outgoing relations for a document. The path must be an **absolute path** (e.g., the `path` returned by `doc ls` or `search`) and the file must exist.

```bash
mindstack doc relation /path/to/kb/docs/example.md
```

Success output:
```json
{
  "path": "/path/to/kb/docs/example.md",
  "outgoing": [
    {"source": "/path/to/kb/docs/example.md", "target": "/path/to/kb/docs/other.md", "score": 0.75, "reason": "...", "sharedTags": ["api"]}
  ],
  "incoming": [
    {"source": "/path/to/kb/docs/ref.md", "target": "/path/to/kb/docs/example.md", "score": 0.8, "reason": "...", "sharedTags": ["tutorial"]}
  ],
  "totalOutgoing": 1,
  "totalIncoming": 1
}
```

### Knowledge Exploration

#### `mindstack related tags`

Lists all tags and their document counts (equivalent to `tags`).

```bash
mindstack related tags
```

#### `mindstack related docs <doc-path>`

Lists outgoing related documents for the given document.

```bash
mindstack related docs /path/to/kb/docs/example.md
```

### Build

#### `mindstack build`

Uses the LLM to generate document metadata and relations in two phases:

1. **Meta phase**: Scans markdown files and generates title/summary/tags/aliases for documents whose content has changed. New documents default to `status: "active"`. Metadata for deleted files is cleaned up automatically.
2. **Relation phase**: For changed documents, finds candidates that share tags and asks the LLM to score the relations and generate relation types.

Progress is written to stderr:

```json
{"file":"docs/a.md","current":1,"total":10,"status":"processing","phase":"meta"}
{"file":"docs/a.md","current":1,"total":10,"status":"done","phase":"meta","summary":"..."}
{"status":"complete","current":10,"total":10}
```

Success output:
```json
{
  "root": "/path/to/kb",
  "status": "complete",
  "filesProcessed": 8,
  "filesSkipped": 2,
  "errors": ["docs/broken.md: read error"]
}
```

Error codes: `LLM_UNAVAILABLE` (exit 3), `BUILD_FAILED` (exit 1).

## Common Workflows

### Browse and Read

```bash
mindstack doc ls                                        # List structure, get absolute paths
# Call the Read tool on the returned paths to read content
mindstack doc meta /path/to/kb/docs/interesting.md      # View metadata (absolute path)
mindstack doc relation /path/to/kb/docs/interesting.md  # View relations (absolute path)
```

### Search and Explore

```bash
mindstack search "api"                                  # Tag search, returns absolute paths
mindstack search "api,rest"                             # Multi-tag AND search
mindstack search "keyword" --fulltext                   # Full-text search
# Call the Read tool on result paths to read content
mindstack doc relation /path/to/kb/docs/api/auth.md     # Explore related docs (absolute path)
```

### Ask a Question

```bash
mindstack ack "what is the api retry policy"        # Retrieve snippets and synthesize an answer (requires LLM)
# Output contains a `summary` and `snippets`; each snippet has an absolute path and line range
# Call the Read tool on snippets[*].path for surrounding context
```

### Create and Edit

To create or edit a document, call the Write/Edit tool directly on the absolute path.

### Post-Build Inspection

```bash
mindstack build       # Run build
mindstack tags       # Inspect the tag distribution
```

## Error Handling

| Error code | Cause | Action |
|------------|-------|--------|
| `NOT_INITIALIZED` (exit 2) | Neither `.mindstack/config.yaml` (knowledge base) nor `mindstack.yaml` (linked project) found | Tell the user to run `init` or `link` |
| `NOT_FOUND` | Wrong file path | Use `ls` to verify the file exists |
| `KB_AMBIGUOUS` | Multiple KBs without a target | Add `--kb <name>` |
| `KB_NOT_FOUND` | `--kb` name does not exist | Use `info` to see the list of available KBs |
| `NAME_CONFLICT` | KB name already registered for a different local path | Pass `--name <alias>` to `init` or `link` |
| `LLM_UNAVAILABLE` (exit 3) | LLM not configured | Tell the user to configure the LLM service |
| `ACK_FAILED` (exit 1) | `ack` execution failed | Check that the LLM is reachable and the KB has been built |

## Notes

- **Paths**: All document paths returned by commands are absolute and can be passed directly to the Read/Write/Edit tools.
- **Input paths**: `doc meta`, `doc relation`, and similar commands take absolute paths as input (pass through the `path` returned by `doc ls` / `search`).
- **`--kb` position**: must come *before* the subcommand — `mindstack --kb name doc ls`, not after.
- **`doc meta` `found: false`**: exit 0 is not an error; it means the document has not been built yet, run `build` to generate metadata.
- **`build` is idempotent**: it skips unmodified documents, so it is safe to re-run.
- **`build` truncation**: very long documents may be truncated before being sent to the LLM, which can degrade summary quality.
