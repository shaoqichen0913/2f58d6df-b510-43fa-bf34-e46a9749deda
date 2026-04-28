#!/usr/bin/env bash
# run.sh — detect test framework and run the test suite
set -euo pipefail

TARGET="${1:-.}"

if [[ ! -d "$TARGET" && ! -f "$TARGET" ]]; then
  echo "Usage: run.sh [path]" >&2
  echo "  path: file or directory to test (default: current directory)" >&2
  exit 1
fi

# Detect test framework
if [[ -f "package.json" ]]; then
  if grep -q '"vitest"' package.json 2>/dev/null; then
    echo "Detected: vitest"
    npx vitest run "$TARGET"
  elif grep -q '"jest"' package.json 2>/dev/null; then
    echo "Detected: jest"
    npx jest "$TARGET"
  else
    echo "Detected: npm test"
    npm test
  fi
elif [[ -f "pyproject.toml" ]] || [[ -f "pytest.ini" ]]; then
  echo "Detected: pytest"
  pytest "$TARGET"
elif [[ -f "go.mod" ]]; then
  echo "Detected: go test"
  go test ./...
else
  echo "No test framework detected in current directory." >&2
  exit 1
fi
