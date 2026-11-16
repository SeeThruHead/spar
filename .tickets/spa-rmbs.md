---
id: spa-rmbs
status: closed
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


## Notes

**2026-11-16T05:43:57Z**

Done: every store has viewing and travelTo(seq | null): while travelling, its state and selectors show the state after that action, new commands still apply to the live state, and travelTo(null) returns to live. A store registers itself with Store.Inspector (a reference that ignores registrations by default). Devtools.layer collects registered stores and Devtools.Panel is a Spar component listing each store's actions with payloads, its state, and Back, Forward, Live and Go to controls. It lives in packages/spar/src (Devtools.ts, devtools/PanelView.tsx), not a separate package. The demo mounts it and the browser test steps the counter back and returns to live. Not done: log export and import, an outbox view in the panel, and an MCP server; states are kept only for actions made in this session (up to 1,000).
