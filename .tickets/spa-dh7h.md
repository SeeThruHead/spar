---
id: spa-dh7h
status: open
deps: [spa-s5y5]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 1
assignee: Shane Keulen
tags: [goal3]
---
# One action log: store commands, UI state changes, route changes and server data, each with a trace id

A single ordered log across the app, with rewind to any point and replay forward.

## Acceptance Criteria

Tests: log holds every kind in order; rewinding restores stores and UI state together.

