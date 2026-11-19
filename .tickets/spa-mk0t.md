---
id: spa-mk0t
status: open
deps: []
links: []
created: 2026-11-19T15:15:37Z
type: feature
priority: 2
assignee: Shane Keulen
tags: [goal5]
---
# Goal 5: server rendering runs the query graph and the client hydrates with the data

The matched route's graph runs on the server, HTML streams, the client hydrates with no refetch and no flash, one joined trace. The server boundary is Effect RPC; no server components. Say what is taken from TanStack Start. Do not build server-only HTML fragments; note if a real need shows up.

