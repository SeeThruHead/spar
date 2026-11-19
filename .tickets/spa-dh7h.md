---
id: spa-dh7h
status: closed
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


## Notes

**2026-11-19T03:59:08Z**

Done. Timeline module: Timeline.note(kind, name, detail) reports to a Recorder reference that is absent by default; Devtools.layer provides it and keeps up to 1000 moments, each with its trace and span id, the UiState snapshot and each store's seq at that moment. Registry.moments, viewing and travelTo(seq | null) rewind stores and the UiState tree together (stores gained a base step so the time before the first command can be shown). Sources: Store commands, UiState.set and update, Router go/replace/back and history moves, and Timeline.note for server data. Every element event and document or window handler now runs in a span named on <type>, so what it causes shares one trace. The panel that shows this log (step, jump, trace link) is built with the devtools plugin and inspector tickets.
