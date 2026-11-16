---
id: spa-up5r
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [principles]
---
# connect rejects props the view does not take, and a leaked-service proof

Exact props check on View.connect so a service or extra key cannot ride along into a view. Add forbidden fixtures.

## Acceptance Criteria

New forbidden files rejected by the type checker.


## Notes

**2026-11-16T04:56:29Z**

Done: connect's view parameter carries a check that the props Effect returns nothing the view does not take; the error names the extra keys. Proof added (a store handed to a view). A props Effect that can only die is exempt, and an inline untyped view still gets its props typed from the Effect.
