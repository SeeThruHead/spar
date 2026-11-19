---
id: spa-fa5x
status: open
deps: [spa-s5y5]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 1
assignee: Shane Keulen
tags: [goal3]
---
# Tracing front to back: spans for mount, command, store change, render and every RPC, W3C context across the network

Browser spans through a proxy route in the app's server to Alloy; one trace for a click and the backend work it causes. Backend error types in a shared RPC contract appear in the component's error type.

## Acceptance Criteria

A trace test: a click produces one connected browser-to-server trace; an unhandled backend error is a compile error (forbidden proof).

