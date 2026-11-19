---
id: spa-t8sv
status: closed
deps: []
links: []
created: 2026-11-19T15:15:37Z
type: feature
priority: 1
assignee: Shane Keulen
tags: [goal5]
---
# Goal 5: queries are declarations, collected and run at the root by dependency graph

Declaring a query does not run it in the component. On a navigation the matched segments' queries are collected and run at the root: everything with no unmet dependency at once, each dependent one the moment its inputs resolve. A lint rule or type error for an accidental waterfall.

