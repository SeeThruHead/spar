---
id: spa-i5s0
status: open
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

