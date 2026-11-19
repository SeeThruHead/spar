---
id: spa-pa0r
status: closed
deps: []
links: []
created: 2026-11-19T03:35:14Z
type: task
priority: 0
assignee: Shane Keulen
tags: [goal3]
---
# Schema only 1: a store's state and every selector output have a Schema

Definition takes state: Schema (required, also used when durable) and selectors are Store.selector(schema, f).

## Acceptance Criteria

No store compiles without them; forbidden proofs for both.


## Notes

**2026-11-19T03:37:15Z**

Done. Definition requires state: Schema (layerDurable no longer takes one) and selectors are Store.selector(schema, select). Proofs: store-without-a-state-schema, selector-without-a-schema, ui-state-without-a-schema.
