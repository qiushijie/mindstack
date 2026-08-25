#!/usr/bin/env bash
# replay_queries.sh — replay historical search queries recorded in chat.db
# against a knowledge base and report the zero-result rate per mode.
#
# Usage: scripts/replay_queries.sh [chat-db] <kb-root> [mindstack-bin]
#
# Exit status is non-zero when the targets are missed:
#   tag-mode zero-result rate  < 20%
#   overall  zero-result rate  < 15%
#   or any replay fails (errors > 0)
set -euo pipefail

DB="${1:-$HOME/Library/Application Support/mindstack/chat.db}"
KB_ROOT="${2:?usage: replay_queries.sh [chat-db] <kb-root> [mindstack-bin]}"
BIN="${3:-mindstack}"

TAG_TARGET=20
OVERALL_TARGET=15

for dep in sqlite3 jq; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    echo "required dependency not found: $dep" >&2
    exit 2
  fi
done

# Resolve BIN to an absolute path before cd-ing into KB_ROOT, otherwise a
# relative BIN would stop resolving after the cd.
case "$BIN" in
  */*)
    bin_dir=$(cd -- "$(dirname -- "$BIN")" && pwd)
    BIN="$bin_dir/$(basename -- "$BIN")"
    if [ ! -x "$BIN" ]; then
      echo "mindstack binary not found or not executable: $BIN" >&2
      exit 2
    fi
    ;;
  *)
    if ! command -v "$BIN" >/dev/null 2>&1; then
      echo "mindstack binary not found in PATH: $BIN" >&2
      exit 2
    fi
    ;;
esac

if [ ! -d "$KB_ROOT" ]; then
  echo "kb root not found: $KB_ROOT" >&2
  exit 2
fi
if [ ! -f "$DB" ]; then
  echo "chat db not found: $DB" >&2
  exit 2
fi

# Escape single quotes before interpolating the path into SQL.
KB_SQL=${KB_ROOT//\'/\'\'}

# Export (query, mode) pairs: deterministically pick the first user message
# and the first assistant message of each session (lowest row id), keeping
# only search sessions (assistant content is a ResultSet JSON carrying a
# "mode" field). Newlines/tabs are stripped in SQL so the tab-separated
# line-based parsing below cannot shift columns or split rows.
PAIRS=$(
  sqlite3 -separator $'\t' "$DB" "
    SELECT replace(replace(u.content, char(10), ' '), char(9), ' '),
           replace(replace(a.content, char(10), ' '), char(9), ' ')
    FROM chat_sessions s
    JOIN chat_messages u ON u.id = (
      SELECT id FROM chat_messages
      WHERE session_id = s.id AND role = 'user'
      ORDER BY id LIMIT 1
    )
    JOIN chat_messages a ON a.id = (
      SELECT id FROM chat_messages
      WHERE session_id = s.id AND role = 'assistant'
      ORDER BY id LIMIT 1
    )
    WHERE s.workspace_path = '$KB_SQL'
  " | while IFS=$'\t' read -r query result; do
    mode=$(printf '%s' "$result" | jq -r '.mode // empty' 2>/dev/null || true)
    if [ -n "$mode" ]; then
      printf '%s\t%s\n' "$mode" "$query"
    fi
  done | sort -u
)

if [ -z "$PAIRS" ]; then
  echo "no historical search queries found for workspace '$KB_ROOT' in $DB" >&2
  echo "hint: the path must match the stored workspace_path exactly (relative paths/symlinks will not match)" >&2
  exit 2
fi

total=0
zero=0
errors=0
tag_total=0
tag_zero=0
ft_total=0
ft_zero=0
hy_total=0
hy_zero=0

cd "$KB_ROOT"

while IFS=$'\t' read -r mode query; do
  [ -z "$query" ] && continue

  # A failed search (non-zero exit) or unparseable output is a replay error,
  # not a genuine zero-result: count it separately and exclude it from the
  # zero/total statistics.
  if ! out=$("$BIN" search --mode "$mode" -- "$query" 2>/dev/null); then
    errors=$((errors + 1))
    continue
  fi
  if ! t=$(printf '%s' "$out" | jq -e -r '.total' 2>/dev/null); then
    errors=$((errors + 1))
    continue
  fi
  case "$t" in
    ''|*[!0-9]*)
      errors=$((errors + 1))
      continue
      ;;
  esac

  total=$((total + 1))
  case "$mode" in
    tag)
      tag_total=$((tag_total + 1))
      if [ "$t" = "0" ]; then tag_zero=$((tag_zero + 1)); fi
      ;;
    fulltext)
      ft_total=$((ft_total + 1))
      if [ "$t" = "0" ]; then ft_zero=$((ft_zero + 1)); fi
      ;;
    hybrid)
      hy_total=$((hy_total + 1))
      if [ "$t" = "0" ]; then hy_zero=$((hy_zero + 1)); fi
      ;;
  esac
  if [ "$t" = "0" ]; then zero=$((zero + 1)); fi
done <<< "$PAIRS"

pct() { # pct <zero> <total>
  [ "$2" = "0" ] && { echo 0; return; }
  echo $(( $1 * 100 / $2 ))
}

tag_pct=$(pct "$tag_zero" "$tag_total")
ft_pct=$(pct "$ft_zero" "$ft_total")
hy_pct=$(pct "$hy_zero" "$hy_total")
all_pct=$(pct "$zero" "$total")

echo "replayed $total unique queries from $DB"
echo "  tag:      $tag_zero/$tag_total zero-result (${tag_pct}%, target < ${TAG_TARGET}%)"
echo "  fulltext: $ft_zero/$ft_total zero-result (${ft_pct}%)"
echo "  hybrid:   $hy_zero/$hy_total zero-result (${hy_pct}%)"
echo "  overall:  $zero/$total zero-result (${all_pct}%, target < ${OVERALL_TARGET}%)"
echo "  errors:   $errors replay failures (excluded from stats)"

rc=0
[ "$tag_pct" -ge "$TAG_TARGET" ] && [ "$tag_total" -gt 0 ] && rc=1
[ "$all_pct" -ge "$OVERALL_TARGET" ] && rc=1
if [ "$errors" -gt 0 ]; then
  echo "not passing: $errors replay(s) failed" >&2
  rc=1
fi
exit "$rc"
