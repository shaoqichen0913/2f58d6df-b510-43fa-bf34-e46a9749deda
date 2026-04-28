# 03 — Skill Spec Research

This document captures the deep research into Anthropic Skills, OpenAI Codex skill loading, the MCP-vs-Skills boundary, and real-world RAG-as-skill patterns. It explains *why* the architectural choices in `01-architecture.md` were made.

The full research report (Apr 2026, with citations to official docs and ~10 reference repos) is preserved here in summary form. The original report sources are linked inline.

## TL;DR

- Anthropic and OpenAI now share **the same skill format**, governed by the open `agentskills.io` standard. Anthropic donated the spec to a Linux Foundation–hosted working group on Dec 18, 2025; OpenAI shipped first-party Codex skill support shortly after.
- The skill format is small: a folder named `kebab-case` with a `SKILL.md` file at the root, optional `scripts/`, `references/`, `assets/` siblings. YAML frontmatter has two required fields (`name`, `description`) and three optional ones (`license`, `compatibility`, `metadata`).
- **Single-purpose skills with clear descriptions are the strongly-recommended pattern**, both by Anthropic's enterprise documentation and by every well-rated example repo. Bundled mega-skills (retrieve + ingest + sync + synthesize all in one) are rare and consistently low-rated.
- **Progressive disclosure** drives this: descriptions are always in context (~100 tokens each), SKILL.md body is loaded only when the skill is matched (~500 lines max), and references/scripts are loaded on demand. Bundling defeats this design.
- **MCP and Skills are complementary, not alternatives.** Anthropic's stated rule: "MCP connects Claude to data; Skills teach Claude what to do with that data." The "skill calls MCP server" composition is the recommended pattern.
- **For RAG specifically**, the dominant pattern in well-rated repos is: skill = retrieval-only playbook; index lifecycle (ingest, embed, sync) lives in a separate CLI / cron job / MCP server. Ten reviewed repos converge on this.

## Anthropic Skills spec, summarized

The canonical SKILL.md format:

```markdown
---
name: knowledge-retriever              # kebab-case, ≤64 chars, [a-z0-9-]+
description: >                         # ≤1024 chars, what + when, third-person
  Retrieves answers from osapiens internal knowledge base. Use when ...
license: Internal use only             # optional
---

# Knowledge Retriever

(Body, ≤500 lines / ~5K tokens recommended.)
```

Folder structure:

```
knowledge-retriever/
├── SKILL.md                # required
├── scripts/                # optional, shell/python/etc, executable on demand
├── references/             # optional, additional docs loaded by reference
└── assets/                 # optional, output templates
```

Frontmatter fields:

- **`name`** (required) — `kebab-case`, lowercase letters/numbers/hyphens, ≤64 chars. `"anthropic"` and `"claude"` are reserved.
- **`description`** (required) — ≤1024 chars. Must describe both *what* the skill does and *when* to use it. Third person, slightly "pushy" tone (combats under-triggering). This is the single most important field; it determines whether the skill ever gets activated.
- **`license`** (optional) — open spec.
- **`compatibility`** (optional) — open spec, used to indicate which runtimes the skill targets.
- **`metadata`** (optional) — free-form additional metadata.

Runtime-specific frontmatter that we **do not use** because it's not portable:

- `allowed-tools`, `disable-model-invocation`, `user-invocable`, `argument-hint`, `model`, `context: fork`, `agent`, `hooks` — Claude Code CLI only
- `agents/openai.yaml` sibling file with `display_name`, `icon_small`, `policy`, `dependencies.tools` — Codex only

Cross-platform skills stick to the open spec only. Runtime-specific extensions are additive at install time, not embedded in the skill source.

## Discovery paths

| Runtime | Path |
|---|---|
| Claude Code | `~/.claude/skills/` (user) and `.claude/skills/` (project) |
| Codex CLI / IDE | `~/.agents/skills/` (user) and `<repo>/.agents/skills/` (project), with legacy `~/.codex/skills/` fallback |
| Universal (`openskills` convention) | `.agent/skills/` |

Our skill loader writes to all three for maximum cross-runtime compatibility, rather than picking one. This is the same pattern `vercel-labs/skills` uses for its 40+ supported agents.

## Progressive disclosure: why granularity matters

Skills load in three levels:

| Level | Content | When loaded | Token cost |
|---|---|---|---|
| L1 | Frontmatter `name + description` | Always (system prompt) | ~100 tokens per installed skill |
| L2 | `SKILL.md` body | Only when the model decides this skill is relevant | ~5K tokens (≤500 lines) |
| L3 | Files in `scripts/` and `references/` | When the model explicitly reads them via bash or fs tools | Variable, only on demand |

The model decides at L1 whether to "open" a skill. **The description must convince it to**. If you bundle multiple workflows into one skill, the description has to advertise multiple triggers, which:

- Causes false triggers when the description matches too broadly
- Causes under-triggering when the description is too generic to match anything specific
- Forces the L2 body to cover all the bundled workflows, blowing the 500-line budget

Anthropic's own engineering blog states it directly:

> "This metadata is the first level of progressive disclosure: it provides just enough information for Claude to know when each skill should be used without loading all of it into context."

This is *the* reason single-purpose skills win.

## Evidence: every well-rated skill repo follows this rule

Reviewed: `anthropics/skills` (17 official skills), `openai/skills` (curated catalog), `vercel-labs/skills`, `numman-ali/openskills`, `travisvn/awesome-claude-skills`, `VoltAgent/awesome-agent-skills`, plus ~5 RAG-specific repos.

**None of them bundle multiple workflows into a single skill.** The official `pdf` skill covers ten PDF operations because they're all "operations on the same artifact, in the same workflow" (one domain, tightly related). Anthropic explicitly endorses that scope. But every official skill covers one domain.

Notably, the `anthropics/skills` repo contains **no RAG skill at all**. RAG appears either:

- as a **third-party RAG-as-skill repo** following the "skill = retrieval-only playbook" pattern, with ingest as a separate concern (e.g., `ConardLi/rag-skill`, `levineam/qmd-skill`)
- as a **platform feature** in Claude Projects (auto-RAG over uploaded knowledge files, no skill required)
- as an **MCP server** for shared/multi-session indexes (e.g., `lyonzin/knowledge-rag`)

This pattern triangulation is what drove our decision to put RAG infrastructure outside the skill.

## OpenAI Codex skill loading mechanism

Codex shipped first-party SKILL.md support in early Dec 2025 (initially behind `--enable skills`, default-on in Codex CLI v0.76.0+). The OpenAI docs explicitly state Codex skills "build on the open agent skills standard."

Codex-specific additions:

- The `agents/openai.yaml` sibling file (optional) provides UI metadata, plus optional `policy` and `dependencies.tools` blocks
- Skill invocation in app-server clients uses `$<skill-name>` markers in user input, plus `skill` input items for explicit injection
- Skills that depend on tools can declare `dependencies.tools: ["mcp_server_name__tool_name"]` (optional, used for prompting the user to install missing MCPs)

None of these conflict with Anthropic's spec; they're additive.

Codex MCP integration is critical for our architecture (full detail in `04-mcp-auth-research.md`). Briefly:

- Codex can connect to **stdio** MCP servers (local subprocess, env-var auth) or **streamable HTTP** servers (remote, OAuth 2.1)
- For HTTP servers, `codex mcp login <server>` runs the full OAuth dance, caches tokens, auto-injects `Authorization: Bearer <token>` on every call
- Per-tool approval modes (`approval_mode = "approve"`) let admins gate destructive operations

## MCP vs Skills boundary

Anthropic's compressed framing (Nov 2025): **"MCP connects Claude to data; Skills teach Claude what to do with that data."**

| Dimension | MCP | Skills |
|---|---|---|
| Layer | Runtime protocol | Filesystem artifact |
| Lifetime | Long-running server, JSON-RPC | Loaded into context on demand |
| Authoring | Code that exposes tools/resources/prompts | Markdown + scripts |
| Token cost | Tool definitions loaded upfront (10K+ tokens for big servers) | Progressive (~100 tokens at L1, more on demand) |
| Best at | Live data, actions, side effects, integration | Procedural knowledge, workflows, domain conventions |

The "skill calls MCP" composition is **explicitly endorsed** by Anthropic. Their own catalog includes `mcp-builder` (a skill that helps you build MCP servers). OpenAI's curated `openai-docs` skill invokes MCP tools by exact name. Both companies recommend "use both together: MCP for connectivity, Skills for procedural knowledge."

The only anti-pattern we found: **wrapping a Skill *as* an MCP server.** The `claude-skills-mcp` bridge was deprecated in 2026 once native skill support eliminated the need. Don't go that direction.

## RAG-as-skill: real-world archetypes

Three patterns observed in well-rated repos:

### A1: Pure retrieval skill, no embedded index

The skill teaches the agent how to navigate a static, hand-maintained file hierarchy. Indexing isn't a skill behavior at all — it's a folder structure on disk plus a hand-maintained `data_structure.md` index per folder. Agent uses grep / pdftotext / pandas via shell, called from the skill's `scripts/`.

Reference: `ConardLi/rag-skill` (~63 stars). One SKILL.md, three reference files, separate `knowledge/` tree with hand-curated indexes. Indexing is the developer's job, not the agent's.

Best for: small to medium static document sets, infrequent updates, no need for vector similarity.

### A2: Skill + MCP hybrid

The skill is retrieval-only; the index lives behind an MCP server that exposes search/fetch tools. The skill teaches the agent which MCP tools to call when, with what filters.

Reference: `lyonzin/knowledge-rag`, `michelabboud/claude-code-helper`, `lookio.app`. The index has its own lifecycle (CLI, cron) outside the skill. Multiple agents can share the same index across sessions because it's a service, not a file tree.

**This is the pattern we use.**

Best for: persistent indexes, multi-session reuse, vector similarity required, ACL filtering required.

### B: Multi-skill split

Several narrow skills with declared dependencies — one for indexing, one for searching, one for ranking, etc. Approximated by `saskinosie/weaviate-claude-skills`, `OmidZamani/dspy-skills`.

Note: this is **not** the user's "Approach B" (one bundled mega-skill). This is "many narrow skills cooperating" — different and less common, used when the full lifecycle must be agent-driven within a single session. Rare in practice.

## What our project uses, and what we don't

We use **A2** (skill + MCP hybrid).

Specifically:

- One narrow `knowledge-retriever` skill teaching the agent how to call `simple_search` / `deep_search` on the RAG MCP
- A separate (out of scope for v1) `knowledge-archiver` skill, callable independently when the user wants to ingest a doc — *also* talks to the same MCP, on different tools
- Both skills together expose the read/write surface of a single underlying RAG index

What we don't do:

- ❌ Bundle retrieval, ingestion, and synthesis in one skill (anti-pattern, fails progressive disclosure)
- ❌ Wrap the skill as an MCP server (deprecated bridge pattern)
- ❌ Run the RAG infrastructure as part of the skill (skill should call services, not host them)
- ❌ Use Codex-only or Claude-only frontmatter (skill must be portable per agentskills.io)

## TypeScript loader stack

For Path D (implementation), the converged stack is:

| Concern | Library | Why |
|---|---|---|
| Frontmatter parsing | `gray-matter` | Industry standard (~5M weekly DL), used by Astro, VitePress |
| Schema validation | `zod` | De facto for modern TS agent tooling, Anthropic SDK peer dep |
| Subprocess execution | `execa` | Proper cancellation, stdio handling, replaces `child_process` |
| Discovery | hand-rolled `fs.readdirSync` walker (~12 lines) | Avoids supply-chain risk flagged on `fast-glob` |
| MCP server | `@modelcontextprotocol/sdk` (TypeScript) | Official SDK; v2 stable target Q1 2026 |
| HTTP framework | Express via `@modelcontextprotocol/express` middleware | Thin adapter, official |

The MCP TypeScript SDK ships official middleware for Express, Hono, and raw Node.js HTTP. For OAuth resource server validation, we use a thin custom layer rather than `mcp-auth.dev` because we need AzureAD-specific token introspection that's simpler done directly.

There is no public TypeScript skill loader library to depend on. Both `numman-ali/openskills` and `vercel-labs/skills` keep parsing logic internal. We write our own (~50 lines), which is cleaner than vendoring and doesn't drag in their CLI dependencies.

## Sources (cited inline above)

- Anthropic Skills overview: https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- Anthropic engineering blog (skills launch): https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Anthropic Complete Guide to Building Skills (PDF, Mar 2026)
- Skills explained — comparison to MCP, prompts, projects, subagents: https://claude.com/blog/skills-explained
- OpenAI Codex skills: https://developers.openai.com/codex/skills
- OpenAI Codex MCP integration: https://developers.openai.com/codex/mcp
- agentskills.io specification: https://agentskills.io/specification.md
- `anthropics/skills` GitHub repo
- `openai/skills` GitHub repo
- `vercel-labs/skills` GitHub repo (~7.5k stars)
- `numman-ali/openskills` GitHub repo (~8.8k stars)
- `travisvn/awesome-claude-skills`
- `VoltAgent/awesome-agent-skills`
- `ConardLi/rag-skill` (canonical A1 example)
- `lyonzin/knowledge-rag` (canonical A2 example)
- Simon Willison "Claude Skills are awesome": https://simonwillison.net/2025/Oct/16/claude-skills/
- Den Delimarsky "MCP November 2025 spec": https://den.dev/blog/mcp-november-authorization-spec/
