---
id: spa-zail
status: open
deps: []
links: []
created: 2026-11-20T01:03:13Z
type: feature
priority: 2
assignee: Shane Keulen
tags: [goal7, site, cheap-model]
---
# A plain view cannot be mounted with props from a component's Effect without a View.taking wrapper

apps/site needed NavGroup = View.taking(fields, outer => ...)(NavGroupView); Haiku wrote the same wrapper. Let View.child take a view.

