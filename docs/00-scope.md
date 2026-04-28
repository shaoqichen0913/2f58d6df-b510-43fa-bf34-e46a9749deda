# 00 — Scope & Task Interpretation

This document captures how the original coding challenge was interpreted and what shaped the project's scope.

## The original task

> Build a TypeScript repository that enables developers to install and use skills locally. Your implementation should be designed such that the skills work natively with OpenAI Codex (e.g. compatible with folder-based skills using SKILL.md, metadata, and optional scripts).
>
> Requirements:
> - Provide a way to install and use skills locally
> - Define a clear structure for what a skill is
> - Demonstrate how skills are discovered and executed
>
> Skills to implement:
> 1. A knowledge retrieval skill
> 2. One additional skill of your choice

## What "executed" actually means

The early framing of this project mistook "executed" for "the framework runs the skill's scripts as a runtime." That interpretation puts the framework in the position of an agent runtime — reading SKILL.md, deciding what to invoke, calling tools — which is what Codex already does. Building a parallel runtime would duplicate Codex's work without adding value.

The correct interpretation: **"executed" means "activated"** — the moment when Codex recognizes a user's query as matching a skill's description and pulls the skill's body into context. This is the Level 1 → Level 2 transition in progressive disclosure (see `02-skill-spec-research.md`).

A framework that demonstrates this needs three things:

1. **Discovery** — find SKILL.md files on the filesystem and parse them into a typed registry
2. **Install** — write skills to the paths Codex looks at (`~/.agents/skills/` for user-global, `<repo>/.agents/skills/` for project-scoped), and translate the skill's MCP server declarations into Codex's `config.toml` format
3. **Activation demonstration** — given a user query and a registry of skills, return which skill Codex would activate. This makes the activation logic observable and testable without booting Codex itself.

The framework treats Codex as the actual runtime. It produces install layouts Codex consumes, and provides a parallel dev-time activation simulator so the activation logic can be reasoned about, tested, and demoed independently.

## Why Codex-only

The task explicitly calls out Codex compatibility ("the skills work natively with OpenAI Codex"). Targeting Codex exclusively keeps the framework focused: one config-file format to translate to (`~/.codex/config.toml`), one set of file paths to install into, one set of frontmatter extensions (`agents/openai.yaml`).

A multi-runtime framework — supporting Claude Code, Gemini CLI, Cursor, etc. simultaneously — is conceivable, but:

- Each runtime has subtle differences in MCP config format and supported fields
- "Generic" abstractions over those differences tend to lose information (the lowest common denominator of features)
- Most skill authors care about *one* runtime they actually use, not the general case
- Refactoring to add a second runtime when needed is straightforward; predicting which second runtime to optimize for is not

The framework is hard-coded to Codex throughout. Future work to support other runtimes is acknowledged as a refactor target but not a current design constraint.

## Project shape

```
skill-framework/
├── packages/
│   ├── framework/          # core: discovery, install, activation, executor
│   └── cli/                # `skills` CLI exposing the framework's capabilities
├── skills/
│   ├── knowledge-retriever/    # example 1: web search + Notion
│   └── (skill 2 TBD)           # example 2: showcases scripts/ in addition to MCP
├── docs/
│   ├── 00-scope.md             # this file
│   ├── 01-architecture.md      # framework architecture
│   └── 02-skill-spec-research.md   # research backing the design
└── archive/                    # earlier work that explored a deeper RAG MCP
```

The `archive/` directory holds an earlier exploration where the project was a full RAG MCP server with AzureAD-based ACL. That work is preserved because it represents real engineering thinking about a related but different problem: "if you had to build the actual MCP backend a knowledge-retrieval skill talks to, how would you do it?" It is not part of the framework's current scope, but anyone curious about the deeper RAG design will find ACL design, identity/JWT schemas, and pipeline architecture documented there.

## Scope decisions

### What the framework does

- Defines a structured `SKILL.md` format with frontmatter for `name`, `description`, optional `mcp_servers`, optional `scripts`, and standard metadata
- Discovers skills across project-local and user-global filesystem paths
- Installs skills into Codex's user-global (`~/.agents/skills/`) or project-scoped (`<repo>/.agents/skills/`) paths, with `--scope user|project` choosing between them
- Translates `mcp_servers` declarations from SKILL.md into Codex's `config.toml` format, merging idempotently with the user's existing config
- Generates Codex's `agents/openai.yaml` sibling file when the skill declares MCP tool dependencies
- Provides an activation simulator that, given a user query, returns which skill matches. Default uses an LLM judge (LLM sees all skill descriptions and the query, picks one); falls back to keyword matching when no API key is available
- Provides a script executor for skills that bundle local scripts (the `scripts/` directory), with environment passthrough and timeout

### What the framework does NOT do

- It does not run agent loops or call MCP tools at runtime. That's Codex's job. The framework's "execution" demonstration is restricted to (a) skill activation, and (b) running a skill's local scripts in dev mode.
- It does not host a vector DB or any retrieval infrastructure. Example skills connect to existing MCP servers (Brave Search, Notion) for retrieval.
- It does not implement custom auth flows. MCP server auth is handled by the underlying MCP server itself (e.g., Notion's OAuth flow runs through Codex's `codex mcp login`).
- It does not target multiple agent runtimes. Codex only.

### The single-source-of-truth value-add

A skill author who wants both the SKILL.md content and the MCP server config that the skill depends on under version control normally has to maintain two files in two formats: `SKILL.md` for the skill body, and a separate hand-written entry in `~/.codex/config.toml` for the MCP servers. They get out of sync.

This framework consolidates: declare both in SKILL.md frontmatter, run `skills install`, and the framework writes the SKILL.md to the right path *and* merges the MCP server entries into `config.toml`. One source, one command, idempotent.

This is the framework's main practical value. Without it, skill distribution requires either bundled install scripts per skill or a README explaining "now manually edit your config.toml to add these entries."

### Two example skills, and why those choices

**Skill 1 — `knowledge-retriever`**: a web-search + Notion hybrid. Demonstrates the framework's MCP config translation: the skill declares dependencies on two MCP servers (one stdio for web search, one HTTP for Notion), and the installer wires them into Codex's `config.toml`.

**Skill 2 — TBD**: will be a script-bundled skill (deferred decision: candidates include an "apply skill" for job applications and a "Karpathy LLM knowledge base skill"). The point is to demonstrate the framework's `scripts/` handling alongside the MCP-only Skill 1.

## Why archive what we archived

The earlier work focused on building a full enterprise RAG MCP server: AzureAD JWT validation, four-tier visibility ACL with embedded chunk metadata, group-based access control with naming-convention enforcement, multi-stage retrieval pipeline (rewriter → retriever → reranker → validator → synthesizer). All of this is reasonable engineering for the *backend* a real knowledge-retrieval skill calls into. But it conflates two layers:

- **The skill ecosystem layer** (what the task asks for): how do I make skills installable and discoverable?
- **The MCP server layer**: how do I build a specific MCP server that a skill might use?

The challenge is at the first layer. The second layer has been preserved in `archive/` for reference but is no longer part of the active project.
