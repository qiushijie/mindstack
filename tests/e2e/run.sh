#!/usr/bin/env bash
set -euo pipefail

# E2E test runner with isolated config directory.
# Usage: cd tests/e2e && bash run.sh

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mindstack-e2e.XXXXXX")"
URL="${WAILS_DEV_URL:-http://localhost:34115}"
WAILS_PID=""

cleanup() {
    if [ -n "$WAILS_PID" ]; then
        kill "$WAILS_PID" 2>/dev/null || true
        wait "$WAILS_PID" 2>/dev/null || true
    fi
    rm -rf "$CONFIG_DIR"
}
trap cleanup EXIT

echo "Config dir: $CONFIG_DIR"
echo "Starting wails dev..."

MINDSTACK_CONFIG_DIR="$CONFIG_DIR" wails dev -projectdir "$ROOT_DIR" &
WAILS_PID=$!

# Wait for wails dev to be ready
echo "Waiting for server at $URL ..."
for i in $(seq 1 60); do
    if curl -sf -o /dev/null "$URL"; then
        echo "Server ready after ${i}s"
        break
    fi
    sleep 1
done

if ! curl -sf -o /dev/null "$URL"; then
    echo "ERROR: server did not start within 60s"
    exit 1
fi

echo "Running e2e tests..."
cd "$(dirname "$0")"
WAILS_DEV_URL="$URL" pnpm playwright test
