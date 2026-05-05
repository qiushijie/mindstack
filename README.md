# MindStack

[中文](docs/README_zh.md)

A developer-focused markdown editor with git repository sync, designed for developers and AI codegen tools to maintain knowledge bases.

## Features

- Markdown editing and rendering
- Git repository sync
- AI-friendly CLI

![Example](docs/images/example.png)

See [example.md](docs/example.md) for all supported node types.

## Getting Started

Go to [Releases](https://github.com/qiushijie/mindstack/releases) and download the latest installer for your platform.

## Development

### Prerequisites

- [Go](https://go.dev/dl/)
- [Node.js](https://nodejs.org/) with pnpm
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
cd frontend && pnpm install
```

### Dev

```bash
wails dev
```

### Build

```bash
wails build
```

Build output goes to `build/bin/`.

### Test

```bash
# Go tests
go test ./...

# Frontend unit tests (vitest + happy-dom)
cd frontend && pnpm vitest run

# E2E tests (Playwright)
# Make sure `wails dev` is running first, then:
cd tests/e2e && pnpm test
```

## License

MIT
