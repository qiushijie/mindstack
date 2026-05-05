#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BINARY_NAME="mindstack"

# Skill language: en (default) or zh
SKILL_LANG="en"
while [[ $# -gt 0 ]]; do
	case "$1" in
		--lang)
			SKILL_LANG="${2:-}"
			shift 2
			;;
		--lang=*)
			SKILL_LANG="${1#*=}"
			shift
			;;
		-h|--help)
			echo "Usage: $0 [--lang <code>]"
			echo "  --lang   Skill language (en|zh), default: en"
			exit 0
			;;
		*)
			echo "unknown argument: $1" >&2
			echo "usage: $0 [--lang <code>]" >&2
			exit 1
			;;
	esac
done

if [ -z "$SKILL_LANG" ]; then
	echo "error: --lang requires a value" >&2
	exit 1
fi

SKILL_SRC="$PROJECT_DIR/skills/mindstack/SKILL.${SKILL_LANG}.md"
if [ ! -f "$SKILL_SRC" ]; then
	echo "error: skill file not found for lang '$SKILL_LANG': $SKILL_SRC" >&2
	exit 1
fi

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

# Install skill into ~/.claude/skills/mindstack/SKILL.md
SKILL_DEST_DIR="$HOME/.claude/skills/mindstack"
SKILL_DEST="$SKILL_DEST_DIR/SKILL.md"
mkdir -p "$SKILL_DEST_DIR"
rm -f "$SKILL_DEST"
cp "$SKILL_SRC" "$SKILL_DEST"
echo "installed skill -> $SKILL_DEST (lang: $SKILL_LANG)"

if ! echo "$PATH" | tr ':' '\n' | grep -q "^${install_dir}\$"; then
	echo ""
	echo "warning: $install_dir is not in your PATH"
	echo "add it with: export PATH=\"$install_dir:\$PATH\""
fi
