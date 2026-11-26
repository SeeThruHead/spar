---
id: spa-flf7
status: closed
deps: []
links: []
created: 2026-11-20T05:32:02Z
type: feature
priority: 2
assignee: Shane Keulen
tags: [goal7, treflex]
---
# A reactive read of whether a store's reaction is running (Treflex's inFlight), so nobody hand-writes a busy flag


## Notes

**2026-11-26T09:58:44Z**

Done by Store.task: store.running.<task> is a Reactive<boolean> computed from the task's running count (internal/store.ts), never stored. Documented in api.md, llms-guide, state-and-server-data and beside-treflex.
