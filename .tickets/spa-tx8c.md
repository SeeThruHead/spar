---
id: spa-tx8c
status: open
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

