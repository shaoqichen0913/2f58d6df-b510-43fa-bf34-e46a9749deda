# Source Selection Heuristics

Quick reference for deciding whether to use Notion or Brave Search for a given query.

## Decision tree

```
Is the question about internal systems, processes, or decisions?
  └─ YES → Start with Notion
       └─ Found relevant page?
            ├─ YES → Use it. Cross-check web only if the page is >6 months old.
            └─ NO  → Fall through to web search
  └─ NO  → Start with Brave Search
       └─ Also check Notion if the topic might have internal context
            (e.g. "how does our auth work" vs "how does OAuth2 work")
```

## Prefer Notion for

- Internal architecture and design decisions (ADRs)
- Team processes, on-call runbooks, incident playbooks
- Internal API contracts and environment variable references
- Onboarding documentation and team-specific tooling guides
- Meeting notes, RFCs in progress, product specs

## Prefer Brave Search for

- Open-source library documentation (`langchain`, `fastapi`, `terraform`, etc.)
- RFCs, W3C specs, OWASP guidelines
- CVEs, security advisories, patch notes
- Job listings, industry surveys, external benchmarks
- Any topic where Notion returned nothing useful

## Conflict resolution

When Notion and web sources disagree:

1. **Check the Notion page's last-edited date.** If it was edited in the last 30 days,
   trust it over a web result.
2. **Check the web source's publication date.** A library's official docs updated
   last week beat a Notion page from two years ago.
3. **Report both** if the discrepancy is substantive — flag it as a potential doc
   hygiene issue for the team.
