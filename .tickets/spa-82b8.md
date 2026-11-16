---
id: spa-82b8
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [testing]
---
# spar/testing: render views with props, fixture layers, a test renderer, role queries

render(view, props), mount(component, layer) returning role-based queries and user actions as Effects, a Story type (name, component or view, layer or props, play), Store test helpers (given, command, expect state and log), TestClock friendly.

## Acceptance Criteria

The repo's own component tests use it and read as specs.


## Notes

**2026-11-16T04:51:04Z**

Done: spar/testing (packages/spar/src/testing.ts, exported as spar/testing; @testing-library/dom is an optional peer). render(view, props) for pure views, mount(component) with whatever layers the test provides, find, findText, gone, eventually, click, fill, press, all by role and accessible name, failing with NotOnScreen that says what was expected. The repo's own tests use it. Decisions: no store test helper, because a store is already a service tested with it.effect, its layer, selectors and the log; the Story type is defined in the stories ticket where it is used.
