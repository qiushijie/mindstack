# Architecture

## Overview

MindStack follows a layered architecture:

- **CLI Layer** (`cmd/cli/`) - Command-line interface using Cobra
- **Internal Packages** (`internal/`) - Core business logic
  - `workspace` - Knowledge base discovery and path validation
  - `meta` - Document metadata management
  - `relation` - Document relationship tracking
  - `search` - Full-text and tag-based search
  - `sync` - Workspace synchronization with LLM
  - `config` - Configuration management
- **Desktop App** (`frontend/`) - Wails-based GUI

## Data Storage

All data is stored in the `.mindstack/` directory:

- `config.yaml` - Knowledge base configuration
- `meta.json` - Document metadata (title, summary, tags, status)
- `relations.json` - Document relationship graph

## Design Decisions

1. **JSON output** - CLI outputs structured JSON for machine readability
2. **Workspace linking** - Projects can link to knowledge bases without being inside them
3. **Incremental sync** - Only changed documents are re-processed
