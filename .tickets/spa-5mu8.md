---
id: spa-5mu8
status: open
deps: []
links: []
created: 2026-11-19T03:59:08Z
type: task
priority: 1
assignee: Shane Keulen
tags: [goal3]
---
# A component is only made from a view with a props Schema: connect and taking refuse a plain function

View.connect and View.taking accept any function from props to an element, so a view written with jsx() calls in a .ts file slips past the build rule (packages/spar/test/devtools.test.ts does this). Require View.Made in their types and convert the stragglers.

## Acceptance Criteria

A forbidden proof by types; no plain function view left in the repo.

