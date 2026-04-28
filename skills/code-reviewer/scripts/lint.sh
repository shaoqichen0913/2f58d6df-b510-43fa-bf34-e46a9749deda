#!/usr/bin/env bash
# scripts/lint.sh — run ESLint + tsc on a target path
# Usage: lint.sh <path>
# Output: JSON { "tool": "lint", "target": "<path>", "issues": [...], "summary": "..." }
set -euo pipefail

TARGET="${1:-.}"
ISSUES=()
ERRORS=0
WARNINGS=0

# ── ESLint ─────────────────────────────────────────────────────────────
if command -v eslint &>/dev/null; then
  RAW=$(eslint "$TARGET" --format json 2>/dev/null || true)
  if [ -n "$RAW" ]; then
    # Parse eslint JSON output and extract issues
    ESLINT_ISSUES=$(echo "$RAW" | node -e "
      const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const issues = [];
      for (const file of data) {
        for (const msg of file.messages) {
          issues.push({
            tool: 'eslint',
            severity: msg.severity === 2 ? 'error' : 'warning',
            file: file.filePath,
            line: msg.line,
            col: msg.column,
            rule: msg.ruleId || 'unknown',
            message: msg.message
          });
        }
      }
      process.stdout.write(JSON.stringify(issues));
    " 2>/dev/null || echo "[]")
    ERRORS=$((ERRORS + $(echo "$ESLINT_ISSUES" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.filter(i=>i.severity==='error').length)" 2>/dev/null || echo 0)))
    WARNINGS=$((WARNINGS + $(echo "$ESLINT_ISSUES" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.filter(i=>i.severity==='warning').length)" 2>/dev/null || echo 0)))
  fi
else
  ESLINT_ISSUES="[]"
fi

# ── TypeScript ──────────────────────────────────────────────────────────
if command -v tsc &>/dev/null && [ -f "tsconfig.json" ]; then
  TSC_OUT=$(tsc --noEmit 2>&1 || true)
  TSC_ISSUES=$(echo "$TSC_OUT" | node -e "
    const lines = require('fs').readFileSync('/dev/stdin','utf8').split('\n').filter(Boolean);
    const issues = [];
    for (const line of lines) {
      const m = line.match(/^(.+)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)$/);
      if (m) {
        issues.push({ tool:'tsc', severity:m[4], file:m[1], line:parseInt(m[2]), col:parseInt(m[3]), rule:m[5], message:m[6] });
      }
    }
    process.stdout.write(JSON.stringify(issues));
  " 2>/dev/null || echo "[]")
  ERRORS=$((ERRORS + $(echo "$TSC_ISSUES" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));console.log(d.filter(i=>i.severity==='error').length)" 2>/dev/null || echo 0)))
else
  TSC_ISSUES="[]"
fi

# ── Output ──────────────────────────────────────────────────────────────
node -e "
const eslint = ${ESLINT_ISSUES:-[]};
const tsc = ${TSC_ISSUES:-[]};
const all = [...eslint, ...tsc];
const result = {
  tool: 'lint',
  target: '${TARGET}',
  errors: ${ERRORS},
  warnings: ${WARNINGS},
  issues: all,
  summary: all.length === 0
    ? 'No issues found.'
    : '${ERRORS} error(s), ${WARNINGS} warning(s) found.'
};
console.log(JSON.stringify(result, null, 2));
"
