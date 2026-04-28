#!/usr/bin/env bash
# scripts/security-scan.sh — lightweight security pattern scan
# Usage: security-scan.sh <path>
# Output: JSON { "tool": "security-scan", "target": "...", "findings": [...] }
set -euo pipefail

TARGET="${1:-.}"
FINDINGS=()

# ── Pattern scanning with grep ──────────────────────────────────────────
scan() {
  local severity="$1"
  local rule="$2"
  local description="$3"
  local pattern="$4"

  while IFS= read -r match; do
    [ -z "$match" ] && continue
    FILE=$(echo "$match" | cut -d: -f1)
    LINE=$(echo "$match" | cut -d: -f2)
    SNIPPET=$(echo "$match" | cut -d: -f3- | sed 's/^[[:space:]]*//' | cut -c1-120)
    FINDINGS+=("{\"severity\":\"${severity}\",\"rule\":\"${rule}\",\"description\":\"${description}\",\"file\":\"${FILE}\",\"line\":${LINE},\"snippet\":$(node -e "process.stdout.write(JSON.stringify('${SNIPPET//\"/\\\"}'))")}")
  done < <(grep -rn --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" \
    -E "$pattern" "$TARGET" 2>/dev/null | head -50 || true)
}

# Hardcoded secrets
scan "critical" "hardcoded-secret" \
  "Possible hardcoded secret or API key" \
  '(api_key|apikey|api_secret|secret_key|password|passwd|auth_token)\s*=\s*["\x27][^"\x27]{8,}'

# console.log with sensitive-sounding args
scan "warning" "sensitive-log" \
  "Logging potentially sensitive data" \
  'console\.(log|debug|info)\s*\(.*?(password|token|secret|key|auth)'

# eval usage
scan "critical" "unsafe-eval" \
  "eval() is a code injection risk" \
  '\beval\s*\('

# Prototype pollution risk
scan "warning" "prototype-pollution" \
  "Direct __proto__ assignment may cause prototype pollution" \
  '__proto__\s*='

# SQL string concatenation
scan "warning" "sql-injection-risk" \
  "String concatenation in SQL query — use parameterized queries" \
  '(query|sql)\s*[=+]\s*["\x27].*\+\s*(req|params|body|input|user)'

# Insecure random
scan "warning" "insecure-random" \
  "Math.random() is not cryptographically secure" \
  'Math\.random\(\)'

# ── Output ──────────────────────────────────────────────────────────────
FINDINGS_JSON=$(printf '%s\n' "${FINDINGS[@]}" | paste -sd, - 2>/dev/null || echo "")

node -e "
const findings = [${FINDINGS_JSON}];
const critical = findings.filter(f => f.severity === 'critical').length;
const warnings = findings.filter(f => f.severity === 'warning').length;
console.log(JSON.stringify({
  tool: 'security-scan',
  target: '${TARGET}',
  critical,
  warnings,
  findings,
  summary: findings.length === 0
    ? 'No security issues detected.'
    : critical + ' critical issue(s), ' + warnings + ' warning(s) found.'
}, null, 2));
"
