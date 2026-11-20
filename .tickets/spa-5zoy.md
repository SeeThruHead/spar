---
id: spa-5zoy
status: closed
deps: []
links: []
created: 2026-11-20T05:32:02Z
type: feature
priority: 2
assignee: Shane Keulen
tags: [goal7, treflex]
---
# A leading mark: drop a repeated command while the first one's work runs (Treflex's leading)


## Notes

**2026-11-20T07:35:28Z**

Done as Store.afterLeading (goal-7 backlog item 3, repeated commands caught -> refused): while the reaction's run lasts, the store refuses the same command before any state change, with the reason; SPAR_SENT_AGAIN's fix now points to it.
