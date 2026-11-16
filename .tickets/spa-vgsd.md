---
id: spa-vgsd
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [repo, testing]
---
# 100% line, branch and function coverage on packages/spar, enforced

Istanbul thresholds at 100. Dead or impossible branches are deleted or typed away, never covered for the sake of it.

## Acceptance Criteria

The test task fails below 100%.


## Notes

**2026-11-16T04:35:36Z**

Found by the new tests: a component that only used UiState had the internal ViewScope left in its requirements and could not be mounted; connect now removes ViewScope and Scope from whatever the props Effect needs. Store.replay now fails with UnknownAction instead of skipping an entry. Row moves and removals use DOM ranges. Reactive exports make, succeed and fromSubscriptionRef.
