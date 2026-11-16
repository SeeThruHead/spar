---
id: spa-wwiq
status: in_progress
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

