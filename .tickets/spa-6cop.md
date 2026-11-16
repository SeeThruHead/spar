---
id: spa-6cop
status: closed
deps: [spa-is9o, spa-1yfb, spa-wwiq]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [docs]
---
# Docs site: getting started, principles, every API with examples, recipes, migration from Foldkit and React

apps/docs built with Spar itself, code highlighted at build time, examples type checked, Mermaid diagrams per the mermaid rule, benchmark results included.

## Acceptance Criteria

Site builds, every example compiles, diagram checks pass.


## Notes

**2026-11-16T05:58:51Z**

Done as markdown in docs/: getting-started, principles (rewritten to match what was built, 12 principles and the differences from the brief), api (every module, each pointing at a type-checked file in the repo), recipes, from-foldkit, from-react, benchmarks (generated), gaps. README links them. Decisions: no docs site app and no Mermaid diagrams (recorded in gaps); examples are taken from code that CI type-checks rather than checked separately.
