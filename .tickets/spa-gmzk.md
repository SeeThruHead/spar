---
id: spa-gmzk
status: open
deps: [spa-vgsd]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 3
assignee: Shane Keulen
tags: [testing]
---
# Mutation testing on the core logic

Stryker with the vitest runner on Store, Outbox, reconcile and the build check. Surviving mutants become tests or deleted code.

## Acceptance Criteria

Mutation score recorded in docs; no surviving mutant in Store or Outbox.


## Notes

**2026-11-16T06:06:10Z**

Not done. Stryker was not set up; the logic has 100% line, branch and function coverage and property tests for replay, routes, row order and the sidebar's sections, but mutants have not been run. Left open and listed in docs/gaps.md and the release report.
