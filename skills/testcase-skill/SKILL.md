---
name: testcase-skill
description: >
  Generates and runs test cases for a given function or module. Use this skill
  when asked to write tests, generate test coverage, or validate code correctness.
  Activates for queries like "write tests for", "generate test cases", "add test coverage".
license: MIT
compatibility:
  agents:
    - codex
metadata:
  author: test-user
  category: testing
  version: "1.1.0"
scripts:
  - name: run
    path: scripts/run.sh
    description: Run the test suite and report results
    timeout_sec: 60
---

# Testcase Skill

Generate and run test cases for functions and modules.

## When to use

Activate this skill when the user needs to:

- Write unit tests for a function or class
- Generate test coverage for an existing module
- Validate that code behaves correctly across edge cases
- Run the test suite and report results

## How to use this skill

### Generating tests

When asked to write tests, follow this pattern:

1. Read the target function/module to understand its inputs and outputs
2. Identify edge cases: empty input, null, boundary values, error paths
3. Write tests that cover the happy path and at least two edge cases
4. Use the project's existing test framework (detect from `package.json` or `pyproject.toml`)

### Running tests

Use the bundled `run` script to execute the test suite:

```
scripts/run.sh [path]
```

The script auto-detects the test framework and runs accordingly:

| Project signal | Framework |
|---|---|
| `package.json` with vitest | `npx vitest run` |
| `package.json` with jest | `npx jest` |
| `package.json` (other) | `npm test` |
| `pyproject.toml` / `pytest.ini` | `pytest` |
| `go.mod` | `go test ./...` |
