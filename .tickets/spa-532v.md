---
id: spa-532v
status: in_progress
deps: []
links: []
created: 2026-11-19T13:35:01Z
type: feature
priority: 1
assignee: Shane Keulen
tags: [goal4]
---
# Goal 4: one way to call the backend

Spar owns backend calls. Effect RPC is the blessed path; HttpApi and plain JSON or OpenAPI clients plug into the same traced client; fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon and other client libraries are refused by the build check. Every call is a span and a log entry the devtools show. Document it.

