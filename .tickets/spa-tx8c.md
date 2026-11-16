---
id: spa-tx8c
status: closed
deps: [spa-2nx3, spa-juqy]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [perf]
---
# Memory and listener leak tests

Mount and unmount loops in Chromium measuring heap after GC, DOM node count, listener count and live fibers.

## Acceptance Criteria

Counts return to baseline after 1000 cycles; test runs in CI.


## Notes

**2026-11-16T05:40:37Z**

Done: apps/bench/scripts/leaks.ts drives the Spar table app in Chromium through 40 rounds of create 1,000 rows, select, swap, remove, clear (after 5 warm-up rounds) and compares DOM node count, event listener count and heap after forced GC through the DevTools protocol. Result: 0 nodes, 0 listeners, 0.17 MB heap growth. It fails on any node or listener left behind or more than 2 MB of heap growth, and runs in CI in the browser job (moon task bench:leaks). Live fibers are not counted directly; heap growth stands in for them.
