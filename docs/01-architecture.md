# 01 — Architecture

This document describes the framework's architecture: what each component does, how they interact, and the design choices behind the boundaries.

The framework targets **OpenAI Codex** as the sole runtime. See `00-scope.md` for the rationale.

## High-level shape

```
                ┌──────────────────────────────────────────────┐
                │           Skill source (filesystem)          │
                │   skills/knowledge-retriever/                │
                │     ├─ SKILL.md          (frontmatter+body)  │
                │     ├─ scripts/          (optional)          │
                │     └─ references/       (optional)          │
                └──────────────────────────────────────────────┘
                          │ discovery
                          ▼
                ┌──────────────────────────────────────────────┐
                │              Skill Registry                  │
                │   typed, validated, in-memory                │
                │   SkillManifest[]                            │
                └──────────────────────────────────────────────┘
                          │
              ┌───────────┼─────────────────────────────┐
              │           │                             │
              ▼           ▼                             ▼
    ┌───────────────┐ ┌─────────────────┐  ┌──────────────────────┐
    │   Installer   │ │   Activator     │  │   Script Executor    │
    │               │ │  (LLM judge)    │  │  (dev-time runner    │
    │  writes to    │ │                 │  │   with env pass-     │
    │  Codex paths  │ │  given a query, │  │   through, timeout)  │
    │  + merges     │ │  picks a skill  │  │                      │
    │  config.toml  │ │                 │  │                      │
    └───────────────┘ └─────────────────┘  └──────────────────────┘
              │
              ▼
    ┌──────────────────────────────────────────────────────────────┐
    │           Codex CLI / IDE — not our code                     │
    │                                                              │
    │  ~/.agents/skills/<name>/SKILL.md           (user-global)    │
    │  <repo>/.agents/skills/<name>/SKILL.md      (project-scope)  │
    │  ~/.codex/config.toml         ← MCP servers merged here      │
    │  <skill>/agents/openai.yaml   ← generated tool deps          │
    └──────────────────────────────────────────────────────────────┘
```

## Components

### Skill source

A skill is a folder containing:

- `SKILL.md` (required) — markdown with YAML frontmatter
- `scripts/` (optional) — executable scripts the skill or agent can invoke
- `references/` (optional) — additional markdown loaded on demand by the agent
- `assets/` (optional) — static files

The framework reads from any folder a developer points it at. It does not impose a project structure on the skill author beyond the SKILL.md format.

### SKILL.md format (with our framework extensions)

The framework supports the standard `agentskills.io` frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`) plus two extensions:

```yaml
---
name: knowledge-retriever
description: >
  ...

# Standard fields
license: MIT
compatibility:
  agents: ["codex"]

# Framework extensions
mcp_servers:
  - name: brave_search
    transport: stdio
    command: npx
    args: ["-y", "@modelcontextprotocol/server-brave-search"]
    env:
      BRAVE_API_KEY: ${BRAVE_API_KEY}
    startup_timeout_sec: 30
  - name: notion
    transport: http
    url: https://mcp.notion.com/mcp
    auth:
      type: oauth
      callback_port: 5555
      resource: "api://notion"
      scopes: ["read", "search"]

scripts:
  - name: format-result
    path: scripts/format.sh
    description: Format raw search results into a readable markdown summary
    timeout_sec: 60
---
```

The `mcp_servers` and `scripts` fields are framework-level metadata. They are stripped before SKILL.md is written to runtime paths (Codex never sees them in the SKILL.md it loads), and they are translated separately:

- `mcp_servers` → entries in Codex's `~/.codex/config.toml` under `[mcp_servers.<n>]` tables
- `scripts` → an `agents/openai.yaml` sibling file declaring the skill's tool dependencies

This indirection — single source in SKILL.md, translated to Codex-native configs at install time — is the framework's main value-add. It removes the gap between "what's in the skill repo" and "what Codex needs to actually use the skill."

### MCP server schema — what we cover

The framework's `mcp_servers` schema mirrors Codex's `[mcp_servers.<n>]` table fields exactly (per the Codex Configuration Reference). Both stdio and streamable-HTTP transports are supported, with all per-transport fields:

**Common fields**: `name`, `transport`, `enabled`, `enabled_tools`, `disabled_tools`, `startup_timeout_sec`, `tool_timeout_sec`, `required`

**stdio-specific**: `command`, `args`, `env`, `env_vars`, `cwd`, `experimental_environment`

**HTTP-specific**: `url`, `bearer_token_env_var`, `http_headers`, `env_http_headers`, `auth` (OAuth config)

Schemas use `.passthrough()` so any field Codex adds in future spec versions is preserved when written to `config.toml` even if our schema doesn't explicitly recognize it. Known fields get type safety; unknown fields are forward-compatible.

### Discovery

Discovery is a filesystem walk that finds all `SKILL.md` files under one or more roots, parses their frontmatter, validates against the schema (Zod), and produces a typed `SkillManifest[]`.

Discovery roots, in order of precedence (later overrides earlier):

1. Paths passed explicitly as arguments
2. `<cwd>/skills/` if it exists (for repo-local skill development)
3. `<cwd>/.agents/skills/` (project-scoped, what Codex itself reads first)
4. `~/.agents/skills/` (user-scoped)

Skills with the same `name` from different roots are surfaced as conflicts; the precedence order picks the winner with a warning logged.

Validation failures are surfaced per-skill, not as a hard fail of the whole discovery run. A registry containing 4 valid skills and 1 invalid skill returns 4 manifests and 1 diagnostic — the framework should never silently drop skills, but it shouldn't refuse to operate when one is malformed either.

### Installer

The installer takes a `SkillManifest` and writes it to a target Codex path (user-global or project-scoped, chosen by `--scope`).

Steps for each install:

1. Resolve target root (`~/.agents/skills/` for `--scope user`, `<repo>/.agents/skills/` for `--scope project`)
2. Create `<target-root>/<skill-name>/`
3. Strip the framework-extension fields from frontmatter, write the cleaned SKILL.md
4. Copy `scripts/`, `references/`, `assets/` directories verbatim
5. Read `~/.codex/config.toml`, merge in the skill's `mcp_servers` entries idempotently (re-running install doesn't duplicate entries; tracking is by `[mcp_servers.<n>]` table key)
6. Generate `<target>/<skill-name>/agents/openai.yaml` if the skill declares scripts or MCP tool dependencies

The installer is **idempotent** — running it twice produces the same result. Tracking is by skill name; replacing a skill with the same name overwrites the existing install.

Uninstall reverses all six steps: removes the skill folder and removes the corresponding `[mcp_servers.<n>]` tables from `config.toml`.

### Activator (the dev-time activation simulator)

The activator answers: "given a user query and the current registry, which skill would Codex activate?"

This is what `executed` in the task description maps to. It exists for three reasons:

- **Demonstrability**: showing skill activation without requiring Codex installation, login, and a real session
- **Testability**: each skill's description can be tested for correct triggering with a fixture set of queries
- **Quality feedback**: developers iterating on a skill's description can see immediately whether it triggers correctly on representative queries

Two implementations:

- **Default: LLM-as-judge.** Given a query, formats a prompt containing all skill descriptions and asks an LLM to pick the best match (or none, if no skill matches). Uses OpenAI or Anthropic API based on which key is set. This is the most faithful simulation of how Codex picks skills — agents themselves work this way.

- **Fallback: keyword matching.** When no LLM API key is configured, falls back to scoring each skill's description by keyword overlap with the query. Less accurate, but lets the framework demo work in offline / API-key-less environments.

The activator returns:

```typescript
{
  skill: SkillManifest | null,        // the picked skill, or null if no match
  confidence: "high" | "medium" | "low" | "none",
  reasoning: string,                  // LLM's stated reason, or keyword-overlap summary
  alternatives: SkillManifest[],      // other skills the LLM considered
}
```

### Script executor

For skills with bundled scripts, the executor lets developers run those scripts directly without going through Codex. This is a dev-time tool — Codex itself runs scripts via its built-in shell tools.

The executor:

- Resolves the script path from the skill manifest
- Spawns the script as a subprocess with `execa`
- Sets `cwd` to the skill folder (so relative paths in the script resolve correctly)
- Injects `SKILL_DIR` env var (so scripts can find their own bundled assets reliably)
- Inherits `PATH` explicitly (avoids `spawn ENOENT` on bare commands)
- Enforces a timeout (default 30s, overridable per-script via the manifest's `scripts[].timeout_sec`)
- Captures stdout/stderr separately, returns structured result

It does not provide arbitrary sandboxing (no `vm2`, no `isolated-vm`). For real isolation in production, use OS primitives (`sandbox-exec` on macOS, `bwrap` on Linux). The dev-mode executor's responsibility is convenience and timeout, not security.

## CLI surface

The `skills` CLI exposes each component as a command:

| Command | What it does |
|---|---|
| `skills list [--root <path>]` | Discover and list all skills, by name + description |
| `skills validate <path>` | Validate a SKILL.md file or folder, report errors |
| `skills install <skill-path> [--scope user|project]` | Install to user-global or project-scoped Codex path |
| `skills uninstall <skill-name> [--scope user|project]` | Remove |
| `skills activate "<query>"` | Run the activator on a query, show the picked skill |
| `skills run <skill-name> <script-name> [args...]` | Execute a bundled script |

The CLI is a thin shell over the framework package. Everything the CLI does is also available as a TypeScript API, so the framework can be used programmatically (e.g., in CI to validate skills, or in editor extensions).

## Schema layer (Path A scope)

The framework defines Zod schemas for every typed boundary:

- `SkillFrontmatter` — the YAML frontmatter, including framework extensions
- `McpServerDecl` — a single MCP server entry under `mcp_servers` (stdio + HTTP variants, mirroring Codex's `config.toml` table)
- `ScriptDecl` — a single script entry under `scripts`
- `SkillManifest` — the parsed, validated representation of a discovered skill (frontmatter + filesystem location + script paths verified to exist)
- `ActivationResult` — the activator's output shape
- `CodexConfigToml` — partial schema for the parts of Codex's `config.toml` we touch (specifically the `[mcp_servers.<n>]` tables)

These schemas are the contract. Tests assert against them. The CLI uses them. Future contributors don't have to read code to understand the data model — they read the schema.

## What's deliberately not done

- **No skill marketplace / registry server.** The framework reads skills from local paths only. Distribution is git clone, not a hosted catalog. Adding a registry is straightforward later but out of scope for this challenge.
- **No skill versioning.** Skills are folders, copied verbatim. If you want versioning, use git.
- **No skill execution sandboxing.** As above, this is a dev tool. Codex brings its own sandboxing.
- **No support for non-stdio/HTTP MCP transports.** SSE was deprecated in MCP 2025-06-18. Future MCP transports can be added by extending `McpServerDecl`.
- **No multi-agent support.** Codex only. See `00-scope.md` for the rationale.
- **No inline tool execution.** The framework simulates *activation* in dev mode but does not simulate the full agent loop. To test "what happens after the skill is activated and the agent calls a tool," use Codex.

## Implementation order (paths)

| Path | Output | Dependencies |
|---|---|---|
| **A** ⏭ | Zod schemas for every boundary | none |
| **B** | Discovery + parser | A |
| **C** | Installer (Codex-only, with config.toml merge) | B |
| **D** | Activator (LLM-judge + keyword fallback) | B |
| **E** | Script executor | B |
| **F** | CLI wrapping all of the above | A–E |
| **G** | Two example skills, full test suite, end-to-end demo | F |
