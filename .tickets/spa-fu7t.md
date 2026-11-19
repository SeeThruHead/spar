---
id: spa-fu7t
status: closed
deps: []
links: []
created: 2026-11-19T22:36:27Z
type: bug
priority: 1
assignee: Shane Keulen
tags: [goal6, corpus]
---
# Corpus: dependency edges need the inspector

From spar-apps (repro/dependency-edge-needs-inspector.md): spar.query.after is filled only when Devtools.startInspecting ran, so traces from any other build lose the dependency edges.

