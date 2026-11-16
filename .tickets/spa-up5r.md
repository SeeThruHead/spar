---
id: spa-up5r
status: open
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [principles]
---
# connect rejects props the view does not take, and a leaked-service proof

Exact props check on View.connect so a service or extra key cannot ride along into a view. Add forbidden fixtures.

## Acceptance Criteria

New forbidden files rejected by the type checker.

