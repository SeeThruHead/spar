---
id: spa-0vvv
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Moves that keep state: moveBefore where the browser has it

Moving a row re-inserts its nodes, resetting iframes and playing media.

## Acceptance Criteria

Rows move with moveBefore when available, with a browser test.


## Notes

**2026-11-16T07:48:25Z**

Done. A row that changes place is moved with moveBefore where the browser has it, so focus, a playing video or an iframe inside it carry on; a node the browser will not move that way, and browsers without it, fall back to insertBefore. Chromium 159 and Firefox 159 have it, WebKit in Playwright 1.65 does not. Tests: unit tests with a stand-in for both paths, and the demo browser test checks that a focused checkbox keeps focus when its row moves.
