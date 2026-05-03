#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARY_NAME="mindstack"

echo "Building $BINARY_NAME..."
cd "$PROJECT_DIR"
go build -o "bin/$BINARY_NAME" ./cmd/cli

# Third-party package manager paths to skip
SKIP_PREFIXES=(
	"/opt/homebrew"
	"/usr/local/Homebrew"
	"/nix"
	"/opt/nix"
)

is_third_party() {
	local dir="$1"
	for prefix in "${SKIP_PREFIXES[@]}"; do
		if [[ "$dir" == "$prefix"* ]]; then
			return 0
		fi
	done
	return 1
}

# Prefer user-owned directories, then writable PATH entries (skip third-party)
install_dir=""
candidates=(
	"$HOME/.local/bin"
	"$(go env GOPATH 2>/dev/null)/bin"
	"$HOME/go/bin"
)
for dir in "${candidates[@]}"; do
	if [ -n "$dir" ] && mkdir -p "$dir" 2>/dev/null && [ -w "$dir" ]; then
		install_dir="$dir"
		break
	fi
done

if [ -z "$install_dir" ]; then
	for dir in $(echo "$PATH" | tr ':' '\n'); do
		if [ -w "$dir" ] 2>/dev/null && ! is_third_party "$dir"; then
			install_dir="$dir"
			break
		fi
	done
fi

if [ ! -w "$install_dir" ] 2>/dev/null; then
	echo "error: no writable directory found in PATH" >&2
	echo "hint: manually copy $PROJECT_DIR/bin/$BINARY_NAME to a directory in your PATH" >&2
	exit 1
fi

cp "$PROJECT_DIR/bin/$BINARY_NAME" "$install_dir/$BINARY_NAME"
chmod +x "$install_dir/$BINARY_NAME"

echo "installed -> $install_dir/$BINARY_NAME"

if ! echo "$PATH" | tr ':' '\n' | grep -q "^${install_dir}\$"; then
	echo ""
	echo "warning: $install_dir is not in your PATH"
	echo "add it with: export PATH=\"$install_dir:\$PATH\""
fi
