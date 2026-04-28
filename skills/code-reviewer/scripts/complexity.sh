#!/usr/bin/env bash
# scripts/complexity.sh — cyclomatic complexity + function length report
# Usage: complexity.sh <path>
# Output: JSON { "tool": "complexity", "target": "...", "functions": [...] }
set -euo pipefail

TARGET="${1:-.}"

# ── Complexity via node ─────────────────────────────────────────────────
# We do a lightweight heuristic: count decision points per function
# (if/else/for/while/case/&&/||/?) and flag > threshold
node - "$TARGET" <<'NODEEOF'
const fs = require('fs');
const path = require('path');

const COMPLEXITY_THRESHOLD = 10;
const LENGTH_THRESHOLD = 50;
const target = process.argv[2] || '.';

function getFiles(dir) {
  if (fs.statSync(dir).isFile()) return [dir];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && !['node_modules', '.git', 'dist'].includes(e.name)) return getFiles(p);
    if (e.isFile() && /\.(ts|tsx|js|jsx)$/.test(e.name)) return [p];
    return [];
  });
}

function analyzeFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf-8');
  const lines = src.split('\n');
  const results = [];

  // Naive function detection: look for function declarations and arrow functions
  const fnRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\(.*\)\s*(?::\s*\w+)?\s*\{)/g;
  let match;

  while ((match = fnRegex.exec(src)) !== null) {
    const fnName = match[1] || match[2] || match[3] || '<anonymous>';
    const startLine = src.slice(0, match.index).split('\n').length;

    // Find the function body (simple brace counting)
    let depth = 0;
    let inFn = false;
    let endLine = startLine;
    let complexity = 1;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i];
      for (const ch of line) {
        if (ch === '{') { depth++; inFn = true; }
        if (ch === '}') { depth--; }
      }
      if (inFn && depth === 0) { endLine = i + 1; break; }

      // Count decision points
      const decisions = (line.match(/\b(if|else|for|while|case|catch)\b|\?\s|\&\&|\|\|/g) || []).length;
      complexity += decisions;
    }

    const length = endLine - startLine;
    const flagComplexity = complexity > COMPLEXITY_THRESHOLD;
    const flagLength = length > LENGTH_THRESHOLD;

    if (flagComplexity || flagLength) {
      results.push({
        file: filePath,
        function: fnName,
        startLine,
        endLine,
        lineCount: length,
        complexity,
        flags: [
          ...(flagComplexity ? [`complexity ${complexity} > threshold ${COMPLEXITY_THRESHOLD}`] : []),
          ...(flagLength ? [`${length} lines > threshold ${LENGTH_THRESHOLD}`] : []),
        ]
      });
    }
  }
  return results;
}

const files = getFiles(target);
const allResults = files.flatMap(f => {
  try { return analyzeFile(f); }
  catch { return []; }
});

console.log(JSON.stringify({
  tool: 'complexity',
  target,
  complexityThreshold: COMPLEXITY_THRESHOLD,
  lengthThreshold: LENGTH_THRESHOLD,
  flaggedFunctions: allResults.length,
  functions: allResults,
  summary: allResults.length === 0
    ? 'All functions within acceptable complexity and length.'
    : `${allResults.length} function(s) exceed complexity or length thresholds.`
}, null, 2));
NODEEOF
