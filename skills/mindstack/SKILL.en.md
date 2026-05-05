---
name: mindstack
description: MindStack CLI usage for AI codegen tools to operate on a markdown knowledge base, including document search, metadata management, relation analysis, and LLM sync
---

# MindStack CLI Usage Guide

## Triggers

Activate this skill when the user wants to operate on a knowledge base:

- Search document content or tags
- Ask a natural-language question and get retrieved snippets plus a synthesized answer
- View document metadata (title, summary, tags, status)
- View document relations
- Sync the workspace (LLM-generated metadata and relations)
- View knowledge base overview
- Edit markdown documents

Keywords: `knowledge base` `mindstack` `document management` `document search` `document relations` `kb sync` `kb` `markdown management`

## Prerequisites

Before any command, the current working directory (or one of its ancestors) must contain `.mindstack/config.yaml`. When multiple knowledge bases are linked, use `--kb <name>` to select the target:

```bash
mindstack --kb kb1 ls
mindstack --kb kb2 meta /path/to/kb2/docs/example.md
```

When only a single knowledge base is linked, `--kb` may be omitted.

The `sync` command requires the LLM service to be available; otherwise it returns `LLM_UNAVAILABLE` (exit code 3).

## Output Format

All commands write JSON to **stdout** and errors to **stderr**.

Error format:
```json
{"error": "error description", "code": "ERROR_CODE"}
```

Exit codes: 0 success, 1 user error, 2 not initialized, 3 LLM unavailable.

The `sync` command emits per-line progress events (JSON) to stderr; the final result still goes to stdout.

## File I/O

**The CLI does not provide read, write, or edit commands.** All document paths returned by commands are absolute paths — operate on them directly with the Read/Write/Edit tools:

- Read a document: call the Read tool on the absolute path returned by `ls`, `search`, `meta`, `relation`, etc.
- Write a document: call the Write tool on the absolute path you want to create or overwrite.
- Edit a document: call the Edit tool on the absolute path.

## Command Reference

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

#### `mindstack ls [path]`

Lists markdown files (`.md` / `.markdown`) and directories. Directories first, sorted alphabetically. Hidden directories and `.mindstack/` are excluded.

```bash
mindstack ls
mindstack ls docs/
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

Tag search by default (comma-separate multiple tags for AND filtering); pass `--fulltext` for full-text search.

```bash
# Tag search (default, case-insensitive)
mindstack search "tutorial"

# Multi-tag search (AND: doc must have ALL tags)
mindstack search "api,rest"

# Full-text search (case-insensitive, substring match)
mindstack search "keyword" --fulltext
```

Tag search output:
```json
{
  "query": "tutorial",
  "mode": "tag",
  "results": [
    {"path": "/path/to/kb/docs/guide.md", "title": "Tutorial", "summary": "Guide summary"}
  ],
  "total": 1
}
```

Full-text search output:
```json
{
  "query": "keyword",
  "mode": "fulltext",
  "results": [
    {"path": "/path/to/kb/docs/example.md", "title": "Example", "matchCount": 3}
  ],
  "total": 1
}
```

Error codes: `SEARCH_FAILED`, `SCAN_FAILED`.

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

#### `mindstack meta <path>`

Show document metadata. The path must be an **absolute path** (e.g., the `path` returned by `ls` or `search`) and the file must exist. Metadata is generated by `sync` via the LLM.

```bash
mindstack meta /path/to/kb/docs/example.md
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

Missing metadata exits 0; `found: false` means the document has not yet been processed by `sync`.

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

#### `mindstack relation <path>`

Shows incoming and outgoing relations for a document. The path must be an **absolute path** (e.g., the `path` returned by `ls` or `search`) and the file must exist.

```bash
mindstack relation /path/to/kb/docs/example.md
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

### Sync

#### `mindstack sync`

Uses the LLM to generate document metadata and relations in two phases:

1. **Meta phase**: Scans markdown files and generates title/summary/tags for documents whose content has changed. New documents default to `status: "active"`. Metadata for deleted files is cleaned up automatically.
2. **Relation phase**: For changed documents, finds candidates that share tags and asks the LLM to score the relations.

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

Error codes: `LLM_UNAVAILABLE` (exit 3), `SYNC_FAILED` (exit 1).

## Common Workflows

### Browse and Read

```bash
mindstack ls                                        # List structure, get absolute paths
# Call the Read tool on the returned paths to read content
mindstack meta /path/to/kb/docs/interesting.md      # View metadata (absolute path)
mindstack relation /path/to/kb/docs/interesting.md  # View relations (absolute path)
```

### Search and Explore

```bash
mindstack search "api"                              # Tag search, returns absolute paths
mindstack search "api,rest"                         # Multi-tag AND search
mindstack search "keyword" --fulltext               # Full-text search
# Call the Read tool on result paths to read content
mindstack relation /path/to/kb/docs/api/auth.md     # Explore related docs (absolute path)
```

### Ask a Question

```bash
mindstack ack "what is the api retry policy"        # Retrieve snippets and synthesize an answer (requires LLM)
# Output contains a `summary` and `snippets`; each snippet has an absolute path and line range
# Call the Read tool on snippets[*].path for surrounding context
```

### Create and Edit

To create or edit a document, call the Write/Edit tool directly on the absolute path.

### Post-Sync Inspection

```bash
mindstack sync       # Run sync
mindstack tags       # Inspect the tag distribution
```

## Error Handling

| Error code | Cause | Action |
|------------|-------|--------|
| `NOT_INITIALIZED` (exit 2) | `.mindstack/` not found | Tell the user to run `init` or `link` |
| `NOT_FOUND` | Wrong file path | Use `ls` to verify the file exists |
| `KB_AMBIGUOUS` | Multiple KBs without a target | Add `--kb <name>` |
| `KB_NOT_FOUND` | `--kb` name does not exist | Use `info` to see the list of available KBs |
| `LLM_UNAVAILABLE` (exit 3) | LLM not configured | Tell the user to configure the LLM service |
| `ACK_FAILED` (exit 1) | `ack` execution failed | Check that the LLM is reachable and the KB has been synced |

## Notes

- **Paths**: All document paths returned by commands are absolute and can be passed directly to the Read/Write/Edit tools.
- **Input paths**: `meta`, `relation`, and similar commands take absolute paths as input (pass through the `path` returned by `ls` / `search`).
- **`--kb` position**: must come *before* the subcommand — `mindstack --kb name ls`, not after.
- **`meta` `found: false`**: exit 0 is not an error; it means the document has not been synced yet, run `sync` to generate metadata.
- **`sync` is idempotent**: it skips unmodified documents, so it is safe to re-run.
- **`sync` truncation**: very long documents may be truncated before being sent to the LLM, which can degrade summary quality.
