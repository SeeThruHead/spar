---
id: spa-uvkk
status: in_progress
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Routing: keep a page mounted across query changes, restore scroll

A page remounts when any param changes; scroll only goes to top.

## Acceptance Criteria

Query-only changes update the page in place where the route says so; back restores scroll; tests cover both.

