# Deployment Guide

## Prerequisites

- Go 1.21+
- Node.js 18+ (for frontend builds)
- Wails CLI v2

## Build

```bash
# Build CLI
go build -o bin/mindstack ./cmd/cli

# Build desktop app
wails build
```

## Configuration

The application reads configuration from `.mindstack/config.yaml`.

Key settings:
- `name` - Knowledge base display name
- `description` - Knowledge base description
- `knowledge_bases` - Linked knowledge base paths

## Running Tests

```bash
# Unit tests
go test ./...

# CLI e2e tests
go test ./cmd/cli/ -run TestE2E

# Frontend e2e tests
cd tests/e2e && pnpm test
```

Refer to the [architecture document](../architecture.md) for system design details.
