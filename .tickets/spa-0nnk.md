---
id: spa-0nnk
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Row creation speed near Solid's

Creating 10,000 rows is about 1.8 times Solid. Profile the per-row Effect steps and remove them.

## Acceptance Criteria

Create 1,000 and 10,000 rows within about 1.3 times Solid in the benchmark.


## Notes

**2026-11-16T07:32:59Z**

Done. A CPU profile (apps/bench/scripts/cpu.ts) showed script time of about 110 ms for 10,000 rows against Solid's 35 ms, with browser layout equal. Two changes: element creation, props, listeners and cell-backed bindings are now plain synchronous calls, and only handles, stream-backed values and nested lists are queued as Effects and run in order afterwards; rows of a plain view are drawn in one synchronous pass with no Effect per row and no scope unless the row queued something. Create 1,000 rows 59 ms to 25-36 ms and 10,000 rows 541 ms to 243-322 ms across runs, 1.13 to 1.34 times Solid in the same runs (was 1.8 to 2.1). Heap at 10,000 rows 17.3 MB. The benchmark's budget is now 2 times Solid instead of 4. What remains is Solid cloning one template per row where Spar creates each element; closing that needs a compile step for JSX and was not attempted.
