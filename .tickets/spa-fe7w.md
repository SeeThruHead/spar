---
id: spa-fe7w
status: closed
deps: []
links: []
created: 2026-11-20T05:32:02Z
type: feature
priority: 2
assignee: Shane Keulen
tags: [goal7, treflex]
---
# Warn when a state's effect has not ended the state, or refusals pile up against one state (Treflex's long-hold report)


## Notes

**2026-11-26T10:07:08Z**

SPAR_REFUSALS_PILED_UP: the third refusal during one run of a task is noticed (log entry + warning, once per run). A state whose effect never ends it cannot happen with Store.task; the hand-written phase field is explained in docs (spa-zg80). A long task with no refusals is not reported (no wall-clock guess).
