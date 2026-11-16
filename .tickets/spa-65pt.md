---
id: spa-65pt
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Review passes: effect-review judgement and code-clarity on the whole codebase

Later tickets skipped the written judgement and clarity pass.

## Acceptance Criteria

Every rule in effect.md and code-clarity-review checked against the whole repo, findings fixed, result recorded.


## Notes

**2026-11-16T08:43:52Z**

Done over the whole repo. Mechanical script (effect-review.sh against the first commit): every finding is an entry point or script running an Effect (allowed there), a lint fixture, the one interface Effect's Struct.Lambda needs, typeof checks inside code that runs in the page during browser tests, and plain string ids in the demo and benchmark apps, which stay because each lives inside one small module pair. Judgement pass against effect.md and the clarity skill, with fixes: Store.ts was 770 lines mixing the store with persistence, tab coordination and intents, so persistence moved to internal/journal.ts (Store.ts is now 477 lines); a keyed list that failed part-way through a batch left the rows it had already made on the page, now taken back (tests for both drawn and mounted rows); one failed update used to stop a list from ever updating again, now each update fails on its own; the lock query used Effect.promise, now a typed tryPromise (done earlier); Router and the devtools Pages service name their spans; App's shared start helper no longer has the same name as its shown option. What stays: DOM tests use short real sleeps to show that nothing happened, since there is no clock to advance in a DOM; dom.ts holds the hydration cursor as well as writes because it is the one module allowed to mutate nodes.
