---
id: spa-juqy
status: open
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [parity]
---
# Subscriptions: timers, document and window events, websockets as scoped streams; preventDefault

One Subscription module: streams acquired in the component scope and released on unmount. Window and document events, media queries, visibility, online and offline, intervals, websocket with reconnect. Declarative preventDefault and stopPropagation on handlers.

## Acceptance Criteria

Dropdown closes on outside click and Escape in the demo; leak test shows zero listeners after unmount.

