---
id: spa-77tx
status: open
deps: []
links: []
created: 2026-11-20T01:03:13Z
type: task
priority: 2
assignee: Shane Keulen
tags: [goal7, site]
---
# Site: devtools switchable on, parallel-loading live example with its trace, video, per-page title, dark mode check


## Notes

**2026-11-20T07:12:04Z**

Done: per-page title (Events.title in the app, the server writes it in the document's head; look.ts checks both). Devtools switch already existed (cookie toggle). Left: parallel-loading example's trace beside it, video, dark mode check.

**2026-11-20T07:13:51Z**

Dark mode check done: look.ts measures text contrast (AA 4.5:1, through a canvas so modern colour formats are read right) on home and docs in dark and on docs in light, with screenshots; all pass.
