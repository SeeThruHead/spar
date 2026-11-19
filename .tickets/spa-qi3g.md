---
id: spa-qi3g
status: closed
deps: [spa-5unk]
links: []
created: 2026-11-19T03:35:14Z
type: task
priority: 0
assignee: Shane Keulen
tags: [goal3]
---
# Schema only 3: route params, events, errors and server data

Every route has a params Schema; recover takes Schema errors only; streams turned into reactive values carry a Schema.

## Acceptance Criteria

Forbidden proof per kind.


## Notes

**2026-11-19T03:53:43Z**

Done: a route with path params needs a Schema naming each (proofs route-params-without-a-schema, route-schema-missing-a-path-param); View.recover takes the error's Schema, not a tag (proof recover-wrong-tag rewritten). Decided: reactive values (Reactive.fromStream, fromSubscriptionRef, succeed) take no Schema of their own, because every place one is shown, kept or passed is already a Schema declaration (props, UI state, selectors, routes); server data arrives through Effect RPC contracts, which are Schemas (the tracing ticket). DOM events are not data; Props.Handler names the event. Principle 13 written.
