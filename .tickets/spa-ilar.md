---
id: spa-ilar
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [parity]
---
# Crash views: a defect in a component's Effect has a fallback view and a report callback

View.crash(FallbackView) enhancer and an App.mount onDefect reporter; the rest of the page keeps working.

## Acceptance Criteria

A dying child shows the fallback, siblings stay mounted, the defect is reported once.


## Notes

**2026-11-16T04:55:41Z**

Done: View.crash(FallbackView) catches a defect in a component's mount, reports it and mounts the fallback with { defect }; siblings are untouched. App.CrashReporter is a reference with a default that logs; an app replaces it with a layer or provideService. An action that dies is reported and its listener keeps running; a reactive binding or a load behind View.pending that dies is reported instead of failing silently.
