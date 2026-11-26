---
id: spa-77tx
status: closed
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

**2026-11-26T12:24:52Z**

Closed 26 Nov. The video is on the front page (SiteView promo, /spar-promo.mp4); spar-video owns re-cuts. The parallel-loading example's trace: DECISION, no second trace drawing inside the demo. The demo's bars are already its waterfall (each query's start and end from the press), and the hint says to turn on the site's devtools switch and press again, which shows the real trace with its spar.query.after chain. Drawing the spans in the page would need a public reactive span reader, which Spar does not have and which this page alone does not justify.
