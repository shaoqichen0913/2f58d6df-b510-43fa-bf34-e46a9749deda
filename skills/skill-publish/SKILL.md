---
name: skill-publish
description: >
  Validates, tests, and publishes a skill to a registry. Use this skill when asked to
  publish, release, or submit a skill — including skills created with Codex's skill
  creator or any folder following the SKILL.md format. Ensures format compliance and
  script tests pass before pushing to the registry. Activates for queries like
  "publish this skill", "release my skill", "submit skill to registry".
license: MIT
compatibility:
  agents:
    - codex
metadata:
  author: shaoqichen0913
  category: tooling
  version: "1.2.0"
scripts:
  - name: validate
    path: scripts/validate.sh
    description: Check SKILL.md schema compliance and format conventions
    timeout_sec: 30
  - name: test
    path: scripts/test.sh
    description: Verify all declared scripts are executable and produce valid output
    timeout_sec: 60
  - name: publish
    path: scripts/publish.sh
    description: Update registry index.json and push skill folder to the registry repo
    timeout_sec: 120
---

# Skill Publish

Quality gate and publisher for agent skills. Works with skills created by Codex's
skill creator or any directory that follows the SKILL.md format.

## When to use

Activate this skill when a user wants to:
- Publish a newly created skill to the shared registry
- Validate that a skill meets the framework's standards before sharing
- Re-publish an updated version of an existing skill

## Workflow

Always follow this sequence — do not skip steps:

### Step 1: Validate

Run the validate script on the skill path:

```
scripts/validate.sh <skill-path>
```

This checks:
- SKILL.md schema compliance (name, description, required fields)
- Naming conventions (kebab-case, no uppercase)
- `## When to use` section is present in the body
- Declared scripts exist on disk and are executable

If validation fails, explain the errors to the user and help them fix the SKILL.md
before continuing. Do not proceed to the next step until validation passes.

### Step 2: Test

Run the test script to verify all bundled scripts behave correctly:

```
scripts/test.sh <skill-path>
```

This checks:
- Each declared script runs without crashing (dry-run with `--help` or `--dry-run`)
- Exit codes are 0 for success cases

If tests fail, show the user the output and ask whether to fix or skip.

### Step 3: Confirm with the user

Before publishing, show the user:
- Skill name and version
- MCP servers that will be registered
- Scripts that will be included
- Whether this is a new skill or an update to an existing one

Ask for explicit confirmation before running the publish script.

### Step 4: Publish

Run the publish script with the skill path and registry:

```
scripts/publish.sh <skill-path> [--registry <repo>]
```

The registry defaults to `$SKILL_REGISTRY_REPO`. The script will:
1. Copy the skill folder to the registry
2. Add or update the entry in `index.json`
3. Commit and push via `gh` CLI

## Required environment

| Variable | Purpose | Required |
|---|---|---|
| `SKILL_REGISTRY_REPO` | GitHub repo for the registry (e.g. `owner/repo`) | Yes, unless `--registry` is passed |

The `gh` CLI must be authenticated (`gh auth login`).

## Conventions enforced

Skills published through this workflow must follow these conventions:

- `name` must be kebab-case and unique in the registry
- `description` must be a single paragraph under 200 characters
- SKILL.md body must include a `## When to use` section
- Scripts must be executable (`chmod +x`)
- `metadata.version` must follow semver (`1.0.0`)
