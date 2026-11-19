---
id: spa-vgha
status: closed
deps: [spa-0cal, spa-76bl]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 2
assignee: Shane Keulen
tags: [goal3]
---
# Live state over MCP: stores, the UiState tree, the action log, component data and traces

Extend the devtools MCP server.

## Acceptance Criteria

Integration test with Effect's MCP client for each tool.


## Notes

**2026-11-19T04:49:55Z**

Done. The page now reports its UI state tree, the one log and which moment is shown, each mounted component (name, place, services, recovered failures, props and UI state as plain values) and its recent spans, next to its stores. New MCP tools: get_ui_state, set_ui_state, get_timeline, rewind, list_components, get_component, get_trace. Test: an agent reads and sets UI state (a value that does not fit is refused with a reason), reads a component, follows the trace of a command and rewinds the whole app, through Effect's MCP client against the real server. Devtools gained components(), startInspecting/stopInspecting and Registry.setUi.
