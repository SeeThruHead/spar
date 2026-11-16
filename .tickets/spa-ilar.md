---
id: spa-ilar
status: open
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [parity]
---
# Crash views: a defect in a component's Effect has a fallback view and a report callback

View.crash(FallbackView) enhancer and an App.mount onDefect reporter; the rest of the page keeps working.

## Acceptance Criteria

A dying child shows the fallback, siblings stay mounted, the defect is reported once.

