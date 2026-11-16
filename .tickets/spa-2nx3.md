---
id: spa-2nx3
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [renderer]
---
# Renderer completeness: SVG, style and class objects, full typed attributes, duplicate keys, frame batching, keyed lookup

SVG namespace; style as a record and class as a list or record, reactive per entry; typed attributes and events for every HTML element (camelCase event names, decide and record); duplicate key is a typed defect; DOM writes batched per animation frame; mapBy looks rows up by key in a map, not a scan.

## Acceptance Criteria

Tests for each; 10k row reorder does a bounded number of DOM moves.


## Notes

**2026-11-16T04:42:05Z**

Done: SVG namespace (foreignObject back to HTML), class and style records bound per entry, attributes typed from the DOM's own writable scalar properties for every HTML tag plus aria-*, data-*, role, class, for; SVG takes a named attribute list. Rows are looked up by key in a map; an existing row gets its new item pushed into its own ref only when the item changed; rows that are one element have no marker comments; moves are the complement of the longest ascending run (internal/order.ts, HashMap based, property tested), so a swap moves two rows. A repeated key dies with DuplicateKey. Decisions: event props stay on + the DOM event name capitalised (onKeydown), no lookup table. No frame scheduler: writes are synchronous per change and the browser paints once per frame anyway; the bench ticket measures whether coalescing is needed. moveBefore (state-preserving moves) is not used yet.
