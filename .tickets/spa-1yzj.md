---
id: spa-1yzj
status: open
deps: []
links: []
created: 2026-11-20T01:03:13Z
type: bug
priority: 2
assignee: Shane Keulen
tags: [goal7, site]
---
# Each server draw mounts a routed page again, so a store beside a component is registered and sent twice

Seen building apps/site: the dehydrated state has site/Counter @ ... and site/Counter @ ...#2. toHtml opens the outlet again on every draw.

