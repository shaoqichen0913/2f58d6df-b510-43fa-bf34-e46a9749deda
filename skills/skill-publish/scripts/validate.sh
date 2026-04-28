#!/usr/bin/env bash
# validate.sh — check SKILL.md schema compliance and format conventions
set -euo pipefail

SKILL_PATH="${1:-}"
if [[ -z "$SKILL_PATH" ]]; then
  echo "Usage: validate.sh <skill-path>" >&2
  exit 1
fi

SKILL_MD="$SKILL_PATH/SKILL.md"
ERRORS=0
WARNINGS=0

fail() { echo "  ✗ $*" >&2; ERRORS=$((ERRORS + 1)); }
warn() { echo "  ⚠ $*"; WARNINGS=$((WARNINGS + 1)); }
ok()   { echo "  ✓ $*"; }

echo ""
echo "Validating: $SKILL_PATH"
echo ""

# ── 0. Detect framework-installed skill ──────────────────────────────────────
if [[ -f "$SKILL_PATH/_framework.json" ]]; then
  fail "this skill was installed by the framework and cannot be published directly"
  echo "" >&2
  echo "  _framework.json indicates this skill was processed by 'skills install':" >&2
  echo "  - mcp_servers and scripts are stripped from SKILL.md at install time" >&2
  echo "  - publishing this would push an incomplete skill to the registry" >&2
  echo "" >&2
  echo "  Edit and publish from the original source directory instead." >&2
  exit 1
fi

# ── 1. SKILL.md exists ──────────────────────────────────────────────────────
if [[ ! -f "$SKILL_MD" ]]; then
  fail "SKILL.md not found"
  exit 1
fi
ok "SKILL.md found"

# ── 2. Framework schema validation ──────────────────────────────────────────
if command -v skills &>/dev/null; then
  VALIDATE_OUTPUT=$(skills validate "$SKILL_PATH" 2>&1)
  VALIDATE_EXIT=$?
  if [[ $VALIDATE_EXIT -eq 0 ]]; then
    ok "Schema valid"
  else
    fail "Schema invalid — fix the following before publishing:"
    echo "$VALIDATE_OUTPUT" | grep -E "^\s+-" | while IFS= read -r line; do
      echo "    $line" >&2
    done
  fi
else
  warn "skills CLI not found — skipping schema check"
fi

# ── 3. Naming convention ─────────────────────────────────────────────────────
NAME=$(grep -m1 '^name:' "$SKILL_MD" | sed 's/name:[[:space:]]*//')
if [[ -z "$NAME" ]]; then
  fail "name field is missing in frontmatter"
elif [[ ! "$NAME" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
  fail "name '$NAME' must be kebab-case (lowercase letters, digits, single hyphens, no leading/trailing hyphens)"
else
  ok "name '$NAME' is kebab-case"
fi

# ── 4. Description length ────────────────────────────────────────────────────
DESC=$(python3 - "$SKILL_MD" <<'PYEOF'
import sys, re
with open(sys.argv[1]) as f:
    content = f.read()
m = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
fm = m.group(1) if m else ""
block = re.search(r"^description:\s*>\n((?:[ \t]+.+\n?)+)", fm, re.MULTILINE)
if block:
    print(" ".join(l.strip() for l in block.group(1).splitlines() if l.strip()))
else:
    inline = re.search(r"^description:\s*(.+)", fm, re.MULTILINE)
    print(inline.group(1).strip() if inline else "")
PYEOF
)
DESC_LEN=${#DESC}
if [[ $DESC_LEN -gt 200 ]]; then
  warn "description is $DESC_LEN chars (recommended: under 200)"
else
  ok "description length OK ($DESC_LEN chars)"
fi

# ── 5. Required body section ─────────────────────────────────────────────────
if grep -q "## When to use" "$SKILL_MD"; then
  ok "'## When to use' section present"
else
  fail "missing '## When to use' section in SKILL.md body"
fi

# ── 6. Semver version ────────────────────────────────────────────────────────
VERSION=$(grep -m1 'version:' "$SKILL_MD" | grep -v '^name:' | sed 's/.*version:[[:space:]]*//' | tr -d '"' || true)
if [[ -z "$VERSION" ]]; then
  warn "metadata.version not set (recommended: semver like 1.0.0)"
elif [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  warn "metadata.version '$VERSION' is not semver (expected: X.Y.Z)"
else
  ok "version '$VERSION' is semver"
fi

# ── 7. Scripts executable ────────────────────────────────────────────────────
if [[ -d "$SKILL_PATH/scripts" ]]; then
  for script in "$SKILL_PATH/scripts/"*.sh; do
    [[ -f "$script" ]] || continue
    if [[ -x "$script" ]]; then
      ok "$(basename "$script") is executable"
    else
      fail "$(basename "$script") is not executable — run: chmod +x $script"
    fi
  done
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo "$ERRORS error(s) found — fix before publishing."
  exit 1
elif [[ $WARNINGS -gt 0 ]]; then
  echo "$WARNINGS warning(s) — skill can be published but consider addressing them."
  exit 0
else
  echo "All checks passed."
  exit 0
fi
