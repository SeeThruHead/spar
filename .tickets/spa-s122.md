---
id: spa-s122
status: closed
deps: []
links: []
created: 2026-11-19T21:10:42Z
type: bug
priority: 2
assignee: Shane Keulen
tags: [goal6]
---
# The trace suite failed once in Firefox: the outbox's retry was not in the first attempt's trace

Seen once in five runs of sidebar:traced in Firefox on 78031a0 (scratch/g6-firefox.log in the investigation folder): 'the retry was not in the trace of the first attempt'. Passed four times after. Not reproduced in Chromium or WebKit. Suspect: the trace kept with an outbox entry is missing or differs when the first send races the persist. Find the cause or show it is the check's timing.

