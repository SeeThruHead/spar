---
id: spa-gjm9
status: closed
deps: []
links: []
created: 2026-11-16T06:08:04Z
type: task
priority: 0
assignee: Shane Keulen
tags: [perf]
---
# Memory near Solid's at 10,000 rows, with the benchmark budget in CI

Heap after 10,000 rows is 61 MB against Solid's 14 MB. Profile what a row holds (scope, closures, cells, listeners), remove it, and add a memory and timing budget that CI runs.

## Acceptance Criteria

Heap at 10,000 rows within about 1.5x of Solid's in the benchmark; a CI job fails over budget.


## Notes

**2026-11-16T06:19:45Z**

Done. Profiled with a live-allocation sample (apps/bench/scripts/allocations.ts over an unminified build). Causes, in order: each store command captured a stack trace when it was made (two per row); every binding and listener made its own action starter holding the whole context; every reactive value built two effects, a stream and three closures up front; each row had a forked scope with a finalizer per binding, plus a row object with two effects and a HashMap entry. Fixes: commands are untraced with a span that captures no stack; one starter per mounted app; reactive values are one small object each; a row has one list of things to stop and one cell, and the list (not each row) is tied to its parent scope. Heap at 10,000 rows 61 MB to 19.1 MB (Solid 14.3, Foldkit 26.6), 1.34 times Solid. bench:memory fails CI above 1.5 times Solid. Creation also got faster: 10,000 rows 541 ms to 423 ms.
