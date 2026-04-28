#!/usr/bin/env bash
# test.sh — verify all declared scripts in a skill are runnable
set -euo pipefail

SKILL_PATH="${1:-}"
if [[ -z "$SKILL_PATH" ]]; then
  echo "Usage: test.sh <skill-path>" >&2
  exit 1
fi

SCRIPTS_DIR="$SKILL_PATH/scripts"
ERRORS=0

ok()   { echo "  ✓ $*"; }
fail() { echo "  ✗ $*" >&2; ((ERRORS++)); }

echo ""
echo "Testing scripts in: $SKILL_PATH"
echo ""

if [[ ! -d "$SCRIPTS_DIR" ]]; then
  echo "  No scripts directory — nothing to test."
  exit 0
fi

SCRIPT_COUNT=0
for script in "$SCRIPTS_DIR"/*.sh; do
  [[ -f "$script" ]] || continue
  ((SCRIPT_COUNT++))
  NAME=$(basename "$script")

  # Check executable
  if [[ ! -x "$script" ]]; then
    fail "$NAME — not executable (run: chmod +x $script)"
    continue
  fi

  # Try --help or --dry-run, fall back to syntax check
  if bash -n "$script" 2>/dev/null; then
    ok "$NAME — syntax OK"
  else
    fail "$NAME — syntax error"
    continue
  fi

  # Run with no args to check it exits gracefully (usage message, not crash)
  set +e
  OUTPUT=$("$script" 2>&1)
  EXIT_CODE=$?
  set -e

  # Exit code 0 or 1 (usage/help) are both acceptable for no-arg invocation
  if [[ $EXIT_CODE -le 1 ]]; then
    ok "$NAME — exits cleanly with no args (exit $EXIT_CODE)"
  else
    fail "$NAME — unexpected exit code $EXIT_CODE with no args"
    echo "    Output: $(echo "$OUTPUT" | head -3)"
  fi
done

echo ""
if [[ $SCRIPT_COUNT -eq 0 ]]; then
  echo "  No scripts found."
  exit 0
elif [[ $ERRORS -gt 0 ]]; then
  echo "$ERRORS script(s) failed."
  exit 1
else
  echo "All $SCRIPT_COUNT script(s) passed."
  exit 0
fi
