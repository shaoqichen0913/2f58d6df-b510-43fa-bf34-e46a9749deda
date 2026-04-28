# Roadmap

Tracks what's done, what's next, and the sequencing of remaining work.

## Status

**Architecture-locked, schemas pending.** Scope is reset around the framework (skill discovery, install, activation, dev-time execution) targeting Codex only. The earlier RAG-MCP exploration is preserved in `archive/`.

## Path 0 — Scope reset ✅

**Done.**

- ✅ Reinterpreted "executed" as "activated" (the moment Codex picks a skill from a query)
- ✅ Identified the framework's actual value-add: unified skill format that translates to Codex's per-runtime configs
- ✅ Locked scope to Codex-only (no Claude Code, no Gemini, no Cursor)
- ✅ Locked path strategy: `--scope user` writes to `~/.agents/skills/`, `--scope project` writes to `<repo>/.agents/skills/`
- ✅ Archived the earlier RAG-MCP exploration into `archive/`
- ✅ Renamed project to `skill-framework`
- ✅ Wrote `docs/00-scope.md` and `docs/01-architecture.md` to reflect the new scope

## Path A — Schemas (next)

Define every typed boundary in the framework with Zod. No code that uses these schemas yet — schemas first, so they're stable when consumed.

- [ ] `packages/framework/src/schemas/frontmatter.ts` — SKILL.md frontmatter (name, description, license, compatibility, metadata) + framework extensions (`mcp_servers`, `scripts`)
- [ ] `packages/framework/src/schemas/mcp-server.ts` — `McpServerDecl` (stdio + HTTP variants, mirroring Codex spec, `.passthrough()` for forward compat)
- [ ] `packages/framework/src/schemas/script.ts` — `ScriptDecl`
- [ ] `packages/framework/src/schemas/manifest.ts` — `SkillManifest` (frontmatter + filesystem location + verified script paths)
- [ ] `packages/framework/src/schemas/activation.ts` — `ActivationResult`
- [ ] `packages/framework/src/schemas/codex-config.ts` — partial schema for the parts of Codex's `config.toml` we touch (specifically the `[mcp_servers.<name>]` tables)

Each schema gets unit tests covering: valid case, every required-field missing case, format violations, edge cases (empty arrays where allowed, environment variable references, malformed paths).

## Path B — Discovery + Parser

- [ ] `packages/framework/src/parser.ts` — read SKILL.md, parse frontmatter (gray-matter), validate against schemas
- [ ] `packages/framework/src/discovery.ts` — walk filesystem roots, build registry, surface conflicts and validation diagnostics
- [ ] Tests: parse valid skills, reject malformed ones, walk multi-root setups, dedupe + report conflicts

## Path C — Installer

- [ ] `packages/framework/src/installer/paths.ts` — resolve `--scope user|project` to filesystem paths
- [ ] `packages/framework/src/installer/config-toml.ts` — read/merge/write `~/.codex/config.toml`, idempotent
- [ ] `packages/framework/src/installer/openai-yaml.ts` — generate `agents/openai.yaml` sibling
- [ ] `packages/framework/src/installer/index.ts` — orchestrator: install/uninstall, with rollback on partial failure
- [ ] Tests: install to mock filesystem, verify exact files written, verify config merges are idempotent and don't clobber unrelated entries, verify uninstall reverses cleanly

## Path D — Activator

- [ ] `packages/framework/src/activator/llm-judge.ts` — LLM-as-judge implementation; supports OpenAI and Anthropic API
- [ ] `packages/framework/src/activator/keyword.ts` — keyword-overlap fallback
- [ ] `packages/framework/src/activator/index.ts` — selects implementation based on env (LLM if API key present, else keyword)
- [ ] Tests: fixture queries paired with expected skills, both implementations tested independently, fallback chain tested

## Path E — Script executor

- [ ] `packages/framework/src/executor.ts` — spawn scripts with `execa`, env passthrough, timeout, structured result
- [ ] Tests: success case, non-zero exit, timeout, missing script, env vars present

## Path F — CLI

- [ ] `packages/cli/src/commands/list.ts`
- [ ] `packages/cli/src/commands/validate.ts`
- [ ] `packages/cli/src/commands/install.ts` — with `--scope user|project`
- [ ] `packages/cli/src/commands/uninstall.ts` — with `--scope user|project`
- [ ] `packages/cli/src/commands/activate.ts`
- [ ] `packages/cli/src/commands/run.ts`
- [ ] `packages/cli/src/index.ts` — entry point with command routing
- [ ] Tests: each command's happy and error paths

## Path G — Example skills + end-to-end demo

- [ ] `skills/knowledge-retriever/SKILL.md` — web search + Notion hybrid; declares both MCP servers
- [ ] `skills/knowledge-retriever/references/` — usage guide, source-selection rules
- [ ] Skill 2 (TBD): a script-bundled skill, demonstrating `scripts/` end-to-end
- [ ] End-to-end demo: install both skills to a fresh `~/.agents/skills/`; run activator against a fixture query set; show generated `config.toml` entries
- [ ] Test: integration test that runs the full discover → install → activate → run flow on a temp filesystem

## Bootstrap (concurrent with Path A)

- [ ] `package.json` (pnpm workspace root)
- [ ] `pnpm-workspace.yaml`
- [ ] `tsconfig.json` (root with project references)
- [ ] `packages/framework/package.json` and `tsconfig.json`
- [ ] `packages/cli/package.json` and `tsconfig.json`
- [ ] Vitest config, ESLint config, prettier config

## Future (out of scope for this challenge)

- Multi-agent support (Claude Code, Gemini CLI, Cursor) — current Codex-only design refactors cleanly when needed
- Hosted skill registry (skills as installable packages)
- Skill versioning (semver in frontmatter, install resolves versions)
- Skill dependencies (skill A depends on skill B being installed)
- Hot-reload during development
- Visual UI for browsing installed skills
