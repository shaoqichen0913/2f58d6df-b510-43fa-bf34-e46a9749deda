---
name: code-reviewer
description: >
  Reviews code for quality, security issues, and style violations. Use this skill
  when asked to review, audit, check, or analyze code — including pull requests,
  individual files, or entire modules. Activates for queries like "review this code",
  "check for security issues", "audit my PR", "find bugs in", "lint", "look for
  code smells", or "is this implementation correct". Can also run static analysis
  scripts directly on local files.
license: MIT
compatibility:
  agents:
    - codex
metadata:
  author: shaoqichen0913
  category: development
  version: "1.1.0"
scripts:
  - name: lint
    path: scripts/lint.sh
    description: >
      Run ESLint + TypeScript type-check on a file or directory and return
      findings as structured JSON. Args: <path-to-file-or-dir>
    timeout_sec: 60

  - name: security-scan
    path: scripts/security-scan.sh
    description: >
      Run a lightweight security scan (checks for hardcoded secrets, dangerous
      patterns, insecure dependencies). Args: <path-to-file-or-dir>
    timeout_sec: 120

  - name: complexity
    path: scripts/complexity.sh
    description: >
      Report cyclomatic complexity and function length for TypeScript/JavaScript
      files. Flags functions above threshold. Args: <path-to-file-or-dir>
    timeout_sec: 30
---

# Code Reviewer

Static analysis and AI-assisted code review for TypeScript/JavaScript projects.

## When to use

Activate this skill when the user asks to:

- Review a pull request, file, or code block for correctness, clarity, or security
- Find bugs, anti-patterns, or code smells
- Check for hardcoded secrets, SQL injection, or other security issues
- Measure complexity and flag overly complex functions
- Get actionable improvement suggestions before merging

## How to use this skill

### AI review (primary)

Read the code and provide a structured review covering:

1. **Correctness** — logic errors, off-by-one, incorrect assumptions
2. **Security** — secrets in code, injection risks, unsafe operations
3. **Maintainability** — naming, complexity, test coverage signals
4. **Performance** — obvious bottlenecks, unnecessary allocations

### Running static analysis scripts

Use the bundled scripts for automated checks before or alongside AI review:

```
# Lint a file
skills run code-reviewer lint --skill-path ./skills/code-reviewer src/index.ts

# Security scan a directory
skills run code-reviewer security-scan --skill-path ./skills/code-reviewer src/

# Complexity report
skills run code-reviewer complexity --skill-path ./skills/code-reviewer src/
```

Or Codex can invoke them directly via its shell tool during a session.

### Review format

Structure every review as:

```
## Summary
<one paragraph: overall quality, main concerns>

## Issues

### 🔴 Critical
- <issue>: <location> — <explanation>

### 🟡 Warnings  
- <issue>: <location> — <explanation>

### 🔵 Suggestions
- <improvement>: <location> — <rationale>

## Verdict
APPROVE | REQUEST_CHANGES | NEEDS_DISCUSSION
```

## No MCP servers required

This skill uses bundled scripts for static analysis and the agent's native
code-reading capability for AI review. No external MCP connections needed.
