---
id: spa-rmbs
status: open
deps: [spa-lb48, spa-82b8]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [parity]
---
# Devtools: action log, state, outbox and time travel

packages/devtools: an overlay component built with Spar that lists actions, shows state diffs and the outbox, steps backwards and forwards by replaying a log prefix, and exports and imports a log.

## Acceptance Criteria

Stepping back in the demo changes the screen; browser test covers it.

