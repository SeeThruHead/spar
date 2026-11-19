---
id: spa-dhu5
status: open
deps: []
links: []
created: 2026-11-19T19:56:57Z
type: feature
priority: 1
assignee: Shane Keulen
tags: [goal6]
---
# Goal 6: send a server-drawn page in pieces as its queries answer

The page is sent whole today. Stream it in pieces, with the trace still joined, and a way for a slow query not to hold back the first draw only if that needs no new knob.

