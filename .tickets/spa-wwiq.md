---
id: spa-wwiq
status: closed
deps: [spa-2nx3]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [perf]
---
# Benchmarks against Solid and Foldkit on the same apps

apps/bench: js-framework-benchmark operations (create 1k and 10k, replace, partial update, select, swap, remove, clear, append) implemented in Spar, Solid and Foldkit, driven by Playwright with traces, medians over repeated runs. 10k rows without jank measured as long tasks and frame times.

## Acceptance Criteria

Results table generated into the docs; regressions fail a perf budget task.


## Notes

**2026-11-16T05:39:39Z**

Done. apps/bench holds the same table app in Spar, Solid 1.9.19 and Foldkit 0.170.0 (three Vite builds) and scripts/bench.ts drives them in headless Chromium, median of 10 runs after 2 warm-ups, and writes docs/benchmarks.md and artifacts/bench.json. The script fails when a Spar operation is over 25 ms and more than 4 times Solid's median. It is run by hand (bun run moon run bench:bench), not in CI, because timings on a shared runner are noise. What the first run found and what changed: (1) every binding and listener was a stream plus a fiber; reactive values, UiState, stores and list rows now sit on a synchronous cell (internal/cell.ts, the second file where mutation is allowed, justified by this measurement), and a listener starts its action directly. Updates now reach the DOM inside the command. (2) Effect's default scheduler yields with setTimeout(0), which browsers clamp to 4 ms; App.mount provides a scheduler that yields through a MessageChannel. (3) A list update no longer yields part way, so the browser does not lay out a half-built table. Create 1,000 rows went 536 ms to 59 ms and 10,000 rows 10.7 s to 0.54 s. Final medians (Spar, Solid, Foldkit): create 1k 59/28/38 ms, create 10k 541/246/377 ms, swap 13/7/14 ms, select 10/8/11 ms; heap after 10k rows 61/14/27 MB; gzip 56/6/98 kB. Spar is about 2 times Solid on creation and level on updates; memory is the weakest number. Handle.focus now waits until its node is on the page. Listener actions start in event order and may overlap if they wait on something.
