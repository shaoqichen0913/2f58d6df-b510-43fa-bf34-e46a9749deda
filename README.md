# Skill Framework

A TypeScript framework for distributing, installing, and managing **agent skills** for OpenAI Codex — with a complete closed loop from registry discovery to in-Codex use to publishing back.

---

## The core idea

A **skill** is a folder containing a `SKILL.md` file (YAML frontmatter + agent instructions) plus optional scripts and reference documents. When installed, a skill teaches Codex what it can do and wires up any MCP servers it needs.

The framework closes three loops that are otherwise manual:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Registry                CLI                  Codex           │
│   ────────                ───                  ─────           │
│                                                                 │
│   index.json  ──search──▶  skills install  ──▶  .codex/        │
│   skills/     ◀─publish──  skill-publish   ◀──  user creates   │
│   README.md               skills doctor          skill in      │
│   (auto-sync)             skills activate         session      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

1. **Discover → Install** — Users search a GitHub-hosted registry and install skills by name. The CLI downloads the skill folder, writes a Codex-compatible SKILL.md, and merges MCP server entries into `config.toml` idempotently.

2. **Use → Update** — The skill runs inside Codex. If the user improves it during a session, they can publish the updated version back to the registry via a PR.

3. **Publish → Registry** — The `skill-publish` skill validates, tests, and opens a pull request. On merge, a GitHub Action regenerates the registry README from `index.json` automatically.

---

## Repository layout

```
skill-framework/
├── packages/
│   ├── framework/              # Core library (npm: @shaoqichen0913/skill-framework)
│   │   └── src/
│   │       ├── schemas/        # Zod schemas for all typed boundaries
│   │       │   ├── frontmatter.ts   # SKILL.md validation + sanitization
│   │       │   ├── mcp-server.ts    # MCP server declarations (stdio / HTTP, auth)
│   │       │   ├── script.ts        # Bundled script declarations + timeout bounds
│   │       │   └── manifest.ts      # Parsed skill + filesystem metadata
│   │       ├── parser.ts       # SKILL.md → SkillManifest
│   │       ├── discovery.ts    # Walk filesystem roots, collect all skills
│   │       ├── registry.ts     # Fetch index.json, download from GitHub API
│   │       ├── installer/      # Copy files, write _framework.json, merge config.toml
│   │       ├── activator/      # LLM-judge + keyword fallback activation strategies
│   │       ├── executor.ts     # Spawn bundled scripts with timeout enforcement
│   │       ├── doctor.ts       # Runtime readiness checks (env vars, MCP handshake)
│   │       └── index.ts        # Public API
│   └── cli/                    # `skills` CLI (npm: @shaoqichen0913/skill-framework-cli)
│       └── src/commands/       # list, search, validate, install, uninstall, activate, run, doctor
├── skills/                     # Skills published to the registry
│   ├── code-reviewer/          # Static analysis via bundled scripts
│   ├── knowledge-retriever/    # Notion docs (OAuth MCP) + Codex native web search
│   ├── skill-publish/          # Validates and publishes skills to the registry
│   └── testcase-skill/         # Generates and runs test cases
└── docs/                       # Architecture notes
```

---

## Quick start (from source)

```bash
pnpm install && pnpm build

# Validate a skill folder
pnpm skills validate ./skills/code-reviewer

# Install locally to project scope (.codex/skills/)
pnpm skills install ./skills/knowledge-retriever --scope project

# List installed skills
pnpm skills list

# Check runtime readiness (env vars, MCP connectivity)
pnpm skills doctor knowledge-retriever --ping

# Simulate activation for a user query
pnpm skills activate "find documentation about authentication"
```

---

## Quick start (as an end user)

```bash
# One-time: configure npm for GitHub Packages
echo "@shaoqichen0913:registry=https://npm.pkg.github.com" >> ~/.npmrc
npm login --registry https://npm.pkg.github.com   # use a GitHub token with read:packages

# Install the CLI globally
npm install -g @shaoqichen0913/skill-framework-cli

# Search and install skills
skills search
skills search "code review"
skills install code-reviewer --scope user
skills install knowledge-retriever --scope project

# Check what's installed
skills list

# Verify runtime readiness
skills doctor code-reviewer
skills doctor knowledge-retriever --ping
```

---

## CLI reference

| Command | Key flags | Description |
|---|---|---|
| `skills list` | `--project-dir` | List all installed skills with MCP server and script counts |
| `skills search [query]` | `--registry <url>` (optional) | Search registry by name and description |
| `skills validate <path>` | — | Validate a skill folder's frontmatter and structure |
| `skills install <name or path>` | `--scope user/project`, `--registry` (optional) | Default: install by name from the default registry. Pass a local path (`./my-skill`) to install from disk instead |
| `skills uninstall <name>` | `--scope user/project` | Remove skill files and clean MCP entries from config.toml |
| `skills activate <query>` | `--strategy auto/llm-judge/keyword` | Show which skills would activate for a query |
| `skills run <skill> <script> [args]` | `--scope`, `--skill-path` | Execute a bundled script from an installed skill |
| `skills doctor <name>` | `--ping` | Check env vars, script permissions, and MCP connectivity |

---

## SKILL.md format

```yaml
---
name: knowledge-retriever        # required — kebab-case, unique in registry
description: >                   # required — what the agent reads to decide activation
  Retrieves information from internal docs and web search.
  Activates for queries like "find docs on", "look up", "how does X work".
license: MIT
compatibility:
  agents: [codex]
metadata:
  version: "1.0.0"               # semver, required for publishing

# Framework extensions (stripped before writing to Codex runtime path):
mcp_servers:
  - name: notion
    transport: http
    url: https://mcp.notion.com/mcp
    auth:
      type: oauth

scripts:
  - name: lint
    path: scripts/lint.sh
    description: Run ESLint on a file or directory
    timeout_sec: 60
---

# Knowledge Retriever

## When to use
Activate this skill when...
```

`mcp_servers` and `scripts` are framework extensions not present in the base agentskills spec. The installer strips them before writing SKILL.md to Codex's runtime path, ensuring Codex always sees a spec-compliant file. The original declarations are preserved in `_framework.json` alongside the installed skill, so `skills doctor` and `skills run` can still access them.

---

## Install scopes

| Scope | Skill destination | Config file |
|---|---|---|
| `project` | `./.codex/skills/<name>/` | `./.codex/config.toml` |
| `user` (global) | `~/.codex/skills/<name>/` | `~/.codex/config.toml` |

MCP server entries are merged into `config.toml` idempotently — installing the same skill twice is safe, and unrelated config entries are never touched.

---

## Activation

When a user sends a query, Codex picks which skills to activate based on the `description` field in SKILL.md. The `skills activate` command simulates this locally:

| Strategy | When used | How |
|---|---|---|
| `llm-judge` | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` present | Sends all skill descriptions + query to GPT-4o-mini or Claude Haiku; model returns ranked results with reasoning |
| `keyword` | No API key (fallback) | Jaccard-similarity between query tokens and skill description tokens — no network calls |
| `auto` | Default | Picks `llm-judge` if an API key is available, `keyword` otherwise |

---

## Skills in the registry

| Skill | What it does |
|---|---|
| `code-reviewer` | Static analysis via three bundled scripts: ESLint, security scan (hardcoded secrets, injection patterns), cyclomatic complexity |
| `knowledge-retriever` | Retrieves from Notion (internal docs, via OAuth MCP) and uses Codex native web search — no bundled scripts |
| `skill-publish` | Validates format, runs tests, and opens a PR to the registry. Enforces: kebab-case name, semver version, `## When to use` section, executable scripts |
| `testcase-skill` | Generates and runs test cases. Auto-detects framework (vitest, jest, pytest, go test) |

---

## Publishing a skill

Install `skill-publish`, then ask Codex to publish:

```
publish my skill at ./path/to/my-skill
```

The agent runs three steps:

1. **Validate** — checks SKILL.md schema, naming convention, description length, semver, script permissions
2. **Test** — verifies all declared scripts are executable and exit cleanly
3. **Publish** — clones the registry, copies the skill folder, updates `index.json`, opens a PR

The commit message for updates includes the version range and changed files:

```
update: my-skill (v1.0.0 → v1.1.0)

- SKILL.md
- scripts/run.sh
```

After a PR is merged, a GitHub Action automatically regenerates the registry README from `index.json`.

**Requirements:**
- `gh` CLI authenticated (`gh auth login`)
- `SKILL_REGISTRY_REPO=<owner/repo>` set in environment

---

## Key design decisions

### `_framework.json` sentinel
Codex reads `.codex/skills/*/SKILL.md` directly. To keep SKILL.md spec-compliant, framework extensions (`mcp_servers`, `scripts`) are stripped at install time and written to a separate `_framework.json` alongside the skill. Tools like `doctor` and `run` read from `_framework.json`; Codex reads only SKILL.md. This avoids patching Codex while preserving all metadata the framework needs.

### Idempotent TOML merge
`config.toml` is shared across all installed skills. The installer reads the file, patches only the entries belonging to the current skill (keyed by `[mcp_servers.<name>]`), and writes back. Running install twice or installing two skills that share an MCP server name does not corrupt the file.

### Registry as a GitHub repo
The registry is a plain GitHub repository with an `index.json` index and skill folders under `skills/`. The CLI fetches via the GitHub Contents API — no server required. Publishing is a PR; the reviewer is the trust gate. A GitHub Action keeps the README table in sync with `index.json` on every merge.

### Dev vs production boundary
Local path install (`skills install ./my-skill`) is intentionally permissive — it only validates SKILL.md structure via the Zod schema. Convention checks (kebab-case naming, description length, `## When to use`, semver, script permissions) are enforced only at publish time via `validate.sh` and PR review.

This is a deliberate choice for an enterprise context: skill authors iterate freely in development, while the registry acts as the production environment with a strict quality gate. Codex itself can install any skill folder, so the framework's value is in managing what reaches the shared registry — not in restricting local experimentation.

### Doctor's two-tier checks
`skills doctor` distinguishes `warn` (non-blocking, e.g. optional env var missing) from `error` (skill cannot function). `--ping` additionally sends a JSON-RPC MCP `initialize` handshake to HTTP servers to verify they respond correctly — not just that the URL resolves.

---

## Development

```bash
pnpm install       # install dependencies
pnpm build         # compile all packages
pnpm test          # run tests (vitest)
pnpm skills <cmd>  # run CLI from source
```

---

## License

MIT
