---
id: spa-ldmv
status: closed
deps: []
links: []
created: 2026-11-19T23:33:24Z
type: bug
priority: 0
assignee: Shane Keulen
tags: [goal6, corpus]
---
# Corpus: detached pages are kept after navigating, since queries began dropping unused data

From spar-apps (repro/dom-nodes-after-eviction.md): after the same seeded 200 actions the two five-level routed apps hold 339 and 400 DOM nodes instead of 43 and 48 and about 30% more heap. Bisected to d52db2a; its parent is clean.

