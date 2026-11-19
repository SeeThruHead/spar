---
id: spa-plbm
status: open
deps: []
links: []
created: 2026-11-19T23:41:08Z
type: bug
priority: 1
assignee: Shane Keulen
tags: [goal6]
---
# Going back and forward leaves a few DOM nodes held each time

apps/bench nav-leaks: going to the five-segment page and back with the browser's Back button 60 times leaves 300 more DOM nodes (5 a cycle), on every commit since that app was added (c110465). Not the cache-eviction regression; link-only scenarios (apps/ssr leaks, apps/sidebar leaks) do not grow.

