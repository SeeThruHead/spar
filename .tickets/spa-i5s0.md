---
id: spa-i5s0
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [principles, telemetry]
---
# A span per component mount and per command, exported over OTLP

connect names its span from the view's name (withSpan stays for overrides, or goes if redundant: decide and record). Every store command and outbox delivery is a span with attributes. Optional OTLP layer configured by URL, default off; demo and proof app send to Alloy at http://192.168.0.29:4318.

## Acceptance Criteria

Spans visible in Tempo through graf for a mount and a command; app works with the endpoint down.


## Notes

**2026-11-16T04:53:45Z**

Done: connect runs every component mount in a span named after its view (View.withSpan is removed; one way). Every store command is a span named store key/action with spar.store, spar.action and spar.entry attributes; the outbox already had its own. Decision: no Spar telemetry module. Export is Effect's Otlp.layerJson provided at the entry point; the demo posts to its own dev server at /otlp, which forwards to OTLP_ENDPOINT when set and drops traces otherwise, so the app works with no collector. Verified in Tempo: service spar-demo shows AppView and the store command spans after a browser test run with OTLP_ENDPOINT=http://192.168.0.29:4318.
