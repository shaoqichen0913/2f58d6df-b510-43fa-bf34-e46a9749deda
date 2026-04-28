---
name: knowledge-retriever
description: >
  Retrieves relevant information from internal documentation and the web to answer
  engineering questions. Use this skill when asked to look up, find, research, or
  summarize information — including internal docs, runbooks, architecture decisions,
  API references, or current best practices. Activates for queries like "find docs on",
  "look up", "search for", "what does X do", "how does Y work", "get context on".
license: MIT
compatibility:
  agents:
    - codex
metadata:
  author: shaoqichen0913
  category: retrieval
  version: "1.1.0"
mcp_servers:
  - name: notion
    transport: http
    url: https://mcp.notion.com/mcp
    auth:
      type: oauth
    enabled_tools:
      - search
      - retrieve_page
      - retrieve_block_children
    description: Internal Notion workspace — engineering docs, ADRs, runbooks, onboarding guides
    required: false
---

# Knowledge Retriever

Retrieve and synthesize information from internal documentation and the web.

## When to use

Activate this skill when the user needs to:

- Find specific information in internal docs, runbooks, or ADRs
- Research current best practices, library versions, or external APIs
- Get context on a system, service, or concept before making a change
- Summarize or compare multiple sources on a topic

## How to use this skill

### 1. Check internal documentation first (Notion)

Always start with Notion for anything that may be org-specific:

```
notion.search({ query: "<topic>" })
notion.retrieve_page({ page_id: "<id>" })
notion.retrieve_block_children({ block_id: "<id>" })
```

Prefer Notion results for:
- Team processes, architecture decisions, on-call runbooks
- Internal API contracts and environment configs
- Any topic where the org's decision overrides generic advice

### 2. Use Codex web search for external information

Use your built-in web search for anything not covered by internal docs:

- Open-source library documentation and changelogs
- Industry best practices and standards (RFCs, OWASP, etc.)
- Recent news or announcements (releases, deprecations, CVEs)

## Synthesis guidelines

1. **Check Notion first** — internal decisions override generic advice
2. **Fall back to web search** when internal docs are silent or outdated
3. **Cite sources** in your response: Notion page title + URL, or web result URL
4. **Resolve conflicts** by preferring the more recent source, noting the discrepancy

## Setup

The `notion` MCP uses OAuth — run `codex mcp login notion` once to authenticate.
