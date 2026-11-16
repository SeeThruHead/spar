---
id: spa-juqy
status: closed
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


## Notes

**2026-11-16T04:46:40Z**

Done: Events module. onWindow and onDocument attach a typed handler in the component's scope (they need the component, so a service cannot write UI state through them; proof added). fromWindow and fromDocument are plain scoped streams for app state. prevent and stop wrap a handler and act synchronously in the listener. online, visible and mediaQuery are reactive values. Reactive.fromStream turns any stream into a reactive value owned by the scope. Decisions: timers are Effect's own Stream.fromSchedule and websockets are effect/socket, both through Reactive.fromStream, so Spar adds no wrapper for either (recipes go in the docs ticket). Listener count after unmount is measured in the leaks ticket. Demo: the thread menu closes on Escape and on a press outside.
