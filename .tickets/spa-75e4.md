---
id: spa-75e4
status: open
deps: [spa-fa5x]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 2
assignee: Shane Keulen
tags: [goal3]
---
# Same components on the server by layers: HTML renderer layer, server stores reading data directly, streaming, Schema-encoded snapshot for hydration

No directives; the layer decides. Demo rendered on the server, hydrated in the browser, one trace spanning both.

## Acceptance Criteria

Browser test in three engines; trace test spanning server render and hydration.

