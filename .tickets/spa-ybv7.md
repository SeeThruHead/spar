---
id: spa-ybv7
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [parity]
---
# Refs and focus through one enhancer

View.refs gives a typed handle to named nodes without exposing the DOM to views; focus, scrollIntoView and measure as Effects.

## Acceptance Criteria

Focus moves into an opened menu and back to its trigger, tested by role.


## Notes

**2026-11-16T04:49:14Z**

Done: Handle module. Handle.make in a component's Effect, ref={handle} on any element, Handle.focus, Handle.scrollIntoView and Handle.measure as Effects (focus and scroll wait up to one second for the node to reach the page, then give up; measure returns an Option). Decision: handles instead of an enhancer, because the component's Effect has to hold the handle to act on it and an enhancer would need a second calling convention. Bug found and fixed: an action list that unmounted its own element was cancelled part way through. A listener's actions now run in the app's scope: when the element goes, its listener is removed and what was already queued still finishes.
