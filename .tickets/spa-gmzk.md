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

