---
id: spa-5unk
status: open
deps: [spa-pa0r]
links: []
created: 2026-11-19T03:35:14Z
type: task
priority: 0
assignee: Shane Keulen
tags: [goal3]
---
# Schema only 2: view and component props are declared with a Schema

Schemas for reactive values, actions, elements and handles so a props Schema can describe everything a view takes; views are made from a props Schema.

## Acceptance Criteria

A view without a props Schema does not compile or is rejected by the build check; all apps converted.

