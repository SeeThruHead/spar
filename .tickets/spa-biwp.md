---
id: spa-biwp
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Docs site with diagrams

Docs are markdown only.

## Acceptance Criteria

A generated local docs site built from docs/, with Mermaid diagrams that pass the mermaid rule; served by a dev task only.


## Notes

**2026-11-16T08:39:44Z**

Done. apps/docs turns docs/*.md into a static site: one page per document with a side list, code highlighted at build time as inline spans, and Mermaid diagrams drawn to inline SVG in headless Chromium, so the pages carry no scripts and nothing external. Three diagrams were added to the docs (how a component is put together, a store command across two tabs, a server-rendered page being taken over). The build fails if a diagram would show text under 13px at 500px wide, and docs:look measures the built pages at 520 and 1100 px and takes screenshots; I read them and fixed note boxes that were tight around their text. It is a local dev site only (bun run --cwd apps/docs dev); nothing is deployed. docs/gaps.md now lists only what is outside this repo's reach.
