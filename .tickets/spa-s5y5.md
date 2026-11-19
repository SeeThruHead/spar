---
id: spa-s5y5
status: open
deps: [spa-jfgv]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 0
assignee: Shane Keulen
tags: [goal3]
---
# Schema only: no way to declare props, state, commands, selectors, events, errors, params or server data without a Schema

Remove every TypeScript-type-only path. UiState.make takes a Schema; store state and selector outputs take Schemas; connect takes a props Schema; errors are Schema errors; events are decoded.

## Acceptance Criteria

Type tests under apps/demo/forbidden: each non-Schema declaration fails to compile; all apps and tests converted.

