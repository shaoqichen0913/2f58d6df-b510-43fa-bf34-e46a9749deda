#!/usr/bin/env bash
# publish.sh — push a skill to a feature branch and open a PR for review
set -euo pipefail

SKILL_PATH=$(cd "${1:-}" 2>/dev/null && pwd || echo "")
REGISTRY_REPO="${2:-${SKILL_REGISTRY_REPO:-}}"

if [[ -z "$SKILL_PATH" ]]; then
  echo "Usage: publish.sh <skill-path> [<owner/repo>]" >&2
  echo "  or set SKILL_REGISTRY_REPO=<owner/repo>" >&2
  echo "  skill-path must be an existing directory" >&2
  exit 1
fi

if [[ -z "$REGISTRY_REPO" ]]; then
  echo "Error: registry repo not specified." >&2
  echo "  Pass as second argument or set SKILL_REGISTRY_REPO=<owner/repo>" >&2
  exit 1
fi

if ! command -v gh &>/dev/null; then
  echo "Error: gh CLI not found. Install from https://cli.github.com" >&2
  exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "Error: not authenticated. Run: gh auth login" >&2
  exit 1
fi

SKILL_MD="$SKILL_PATH/SKILL.md"
SKILL_NAME=$(grep -m1 '^name:' "$SKILL_MD" | sed 's/name:[[:space:]]*//')
SKILL_DESC=$(python3 - "$SKILL_MD" <<'PYEOF'
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
VERSION=$(grep -m1 'version:' "$SKILL_MD" | sed 's/.*version:[[:space:]]*//' | tr -d '"' || echo "")

if [[ -z "$SKILL_NAME" ]]; then
  echo "Error: could not read skill name from SKILL.md" >&2
  exit 1
fi

BRANCH="publish/${SKILL_NAME}"

echo ""
echo "Publishing '$SKILL_NAME' → $REGISTRY_REPO (branch: $BRANCH)"
echo ""

# ── Clone registry to temp dir ───────────────────────────────────────────────
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "  Cloning registry..."
gh repo clone "$REGISTRY_REPO" "$TMP_DIR/registry" -- --depth=1 --quiet

cd "$TMP_DIR/registry"

# ── Create or reset feature branch ──────────────────────────────────────────
git checkout -B "$BRANCH"

# ── Copy skill folder ────────────────────────────────────────────────────────
DEST="$TMP_DIR/registry/skills/$SKILL_NAME"
IS_UPDATE=false
if [[ -d "$DEST" ]]; then
  IS_UPDATE=true

  # Warn if version hasn't changed
  PREV_VERSION=$(grep -m1 'version:' "$DEST/SKILL.md" 2>/dev/null | sed 's/.*version:[[:space:]]*//' | tr -d '"' || echo "")
  if [[ -n "$VERSION" && -n "$PREV_VERSION" && "$VERSION" == "$PREV_VERSION" ]]; then
    echo "  ⚠ Version is still $VERSION — consider bumping metadata.version before publishing." >&2
  fi

  echo "  Updating existing skill '$SKILL_NAME'..."
else
  echo "  Adding new skill '$SKILL_NAME'..."
  mkdir -p "$DEST"
fi

# Sync skill folder, excluding framework-internal files
rsync -a --delete --exclude="_framework.json" "$SKILL_PATH/" "$DEST/"

# ── Update index.json ────────────────────────────────────────────────────────
INDEX="$TMP_DIR/registry/index.json"
[[ -f "$INDEX" ]] || echo "[]" > "$INDEX"

python3 - "$INDEX" "$SKILL_NAME" "$SKILL_DESC" <<'EOF'
import json, sys
index_path, name, desc = sys.argv[1], sys.argv[2], sys.argv[3]
with open(index_path) as f:
    entries = json.load(f)
entries = [e for e in entries if e.get("name") != name]
entries.append({"name": name, "description": desc.strip(), "path": f"skills/{name}"})
entries.sort(key=lambda e: e["name"])
with open(index_path, "w") as f:
    json.dump(entries, f, indent=2)
    f.write("\n")
EOF

echo "  Updated index.json"

# ── Commit ───────────────────────────────────────────────────────────────────
git add .
git diff --cached --stat

if [[ "$IS_UPDATE" == true ]]; then
  # Version range in subject
  if [[ -n "$PREV_VERSION" && -n "$VERSION" && "$PREV_VERSION" != "$VERSION" ]]; then
    COMMIT_SUBJECT="update: $SKILL_NAME (v$PREV_VERSION → v$VERSION)"
  elif [[ -n "$VERSION" ]]; then
    COMMIT_SUBJECT="update: $SKILL_NAME (v$VERSION)"
  else
    COMMIT_SUBJECT="update: $SKILL_NAME"
  fi
  # Body: list changed files relative to skill root (index.json excluded)
  CHANGED=$(git diff --cached --name-only | grep "^skills/$SKILL_NAME/" | sed "s|^skills/$SKILL_NAME/||")
  if [[ -n "$CHANGED" ]]; then
    COMMIT_BODY="$(echo "$CHANGED" | sed 's/^/- /')"
    git commit -m "$COMMIT_SUBJECT" -m "$COMMIT_BODY" --quiet
  else
    git commit -m "$COMMIT_SUBJECT" --quiet
  fi
else
  COMMIT_MSG="add: $SKILL_NAME"
  [[ -n "$VERSION" ]] && COMMIT_MSG="$COMMIT_MSG (v$VERSION)"
  git commit -m "$COMMIT_MSG" --quiet
fi

# ── Push branch ──────────────────────────────────────────────────────────────
git push --force origin "$BRANCH" --quiet

# ── Open PR ──────────────────────────────────────────────────────────────────
if [[ "$IS_UPDATE" == true ]]; then
  if [[ -n "$PREV_VERSION" && -n "$VERSION" && "$PREV_VERSION" != "$VERSION" ]]; then
    PR_TITLE="Update skill: $SKILL_NAME (v$PREV_VERSION → v$VERSION)"
  elif [[ -n "$VERSION" ]]; then
    PR_TITLE="Update skill: $SKILL_NAME (v$VERSION)"
  else
    PR_TITLE="Update skill: $SKILL_NAME"
  fi
else
  PR_TITLE="Add skill: $SKILL_NAME"
  [[ -n "$VERSION" ]] && PR_TITLE="$PR_TITLE (v$VERSION)"
fi

PR_BODY="## Skill: \`$SKILL_NAME\`

$SKILL_DESC

## Checklist
- [x] \`validate.sh\` passed
- [x] \`test.sh\` passed
- [ ] Reviewed by maintainer

## Install (after merge)
\`\`\`bash
skills install $SKILL_NAME
\`\`\`"

# Create PR (or get existing PR URL if branch already has one)
PR_URL=$(gh pr create \
  --repo "$REGISTRY_REPO" \
  --base main \
  --head "$BRANCH" \
  --title "$PR_TITLE" \
  --body "$PR_BODY" 2>/dev/null \
  || gh pr view "$BRANCH" --repo "$REGISTRY_REPO" --json url -q .url)

echo ""
echo "✓ PR opened for review: $PR_URL"
echo "  Skill will be available after merge: skills install $SKILL_NAME"
