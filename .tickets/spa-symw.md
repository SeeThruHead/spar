---
id: spa-symw
status: open
deps: []
links: []
created: 2026-11-20T01:03:13Z
type: task
priority: 2
assignee: Shane Keulen
tags: [goal7, site]
---
# Site: code samples compiled in CI, a browser task from look.ts, private deploy via the homelab agent


## Notes

**2026-11-20T07:17:38Z**

Done: scripts/samples.ts (bun run samples:check, in check and CI) fails when a docs sample that names its file is no longer in that file; five drifted samples fixed. site:look is a moon task and runs in CI's browser job. Left: compiling samples that name no file; deploy stays with the homelab agent.
