---
id: spa-s5y5
status: closed
deps: [spa-jfgv, spa-pa0r, spa-5unk, spa-qi3g]
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


## Notes

**2026-11-19T03:53:43Z**

All three parts done: stores and selectors, props (views and components), routes and errors. Principle 13 in docs/principles.md lists what takes a Schema and what was decided for reactive plumbing and DOM events. Forbidden proofs added: store-without-a-state-schema, selector-without-a-schema, ui-state-without-a-schema, view-without-a-schema, component-props-without-a-schema, route-params-without-a-schema, route-schema-missing-a-path-param, and recover by tag name.
