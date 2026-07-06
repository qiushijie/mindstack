#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Running frontend unit tests"
cd "$ROOT_DIR/frontend"
pnpm vitest run

echo "==> Running editor-specific e2e specs"
cd "$ROOT_DIR/tests/e2e"
pnpm test -- specs/editor-selection-stability.spec.ts specs/editor-widget-selection.spec.ts specs/editor-long-document.spec.ts

echo "==> Editor regression passed"
