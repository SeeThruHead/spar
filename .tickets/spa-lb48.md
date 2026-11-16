---
id: spa-lb48
status: open
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [parity]
---
# Store persistence and a production outbox

Opt-in durable action log or snapshot per store with schema versions (additive only). Outbox: ordered delivery per channel, retry cap with a dead-letter list the UI can show, attempt timeouts, one owner across tabs (Web Locks), offline detection.

## Acceptance Criteria

Reload restores state; two tabs deliver once; an item that never succeeds lands in dead letters; property tests for replay.

