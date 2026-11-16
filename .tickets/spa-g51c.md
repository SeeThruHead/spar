---
id: spa-g51c
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 0
assignee: Shane Keulen
tags: [repo]
---
# lefthook, attribution check and AGENTS.md

pre-commit format+lint+typecheck, commit-msg attribution hook, pre-push tests. Test that scans tracked files and history for AI attribution. AGENTS.md: commands, architecture, what the build step enforces, what reviewers check.

## Acceptance Criteria

A commit with an attribution trailer is refused; hooks installed by prepare.


## Notes

**2026-11-16T04:29:45Z**

Review: effect-review.sh hits that stay: scripts are entry points (Effect.run), ToReactive must be an interface for Struct.Lambda (lint override on Store.ts), satisfies is not on a service. Demo thread ids are unbranded; the proof app ticket replaces the demo data layer.
