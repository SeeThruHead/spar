---
id: spa-uvkk
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Routing: keep a page mounted across query changes, restore scroll

A page remounts when any param changes; scroll only goes to top.

## Acceptance Criteria

Query-only changes update the page in place where the route says so; back restores scroll; tests cover both.


## Notes

**2026-11-16T07:46:26Z**

Done. Router.live(route, Page) keeps a page mounted while only its query changes and gives it params as a reactive value (the outlet's row cell carries the latest location); Router.on still remounts on any change. In a browser the router takes over scroll restoration: each history entry gets an id, the scroll position is saved under it when leaving (by a link or by back and forward), a new page starts at the top, and arriving by back or forward scrolls to the saved place, retrying for up to two seconds while late content arrives. Tests: unit tests for both, and a Gherkin scenario in the proof app run in Chromium, Firefox and WebKit. Entry ids come from a counter in sessionStorage, not randomness.
