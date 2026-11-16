---
id: spa-1yfb
status: open
deps: [spa-juqy]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [parity]
---
# Router: typed, nested routes with data loading through Effect

The URL is a store: navigation is a command, the current route is a selector. Route definitions are Schema based and two-way (parse and build). Route.outlet mounts the component for the current route with its own scope; nested routes; loaders are the component's props Effect so pending and recover apply; typed links; scroll and focus restoration.

## Acceptance Criteria

Nested demo with params and a failing loader; back and forward work; a link to an unknown route is a compile error.

