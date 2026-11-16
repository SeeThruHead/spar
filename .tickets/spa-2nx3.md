---
id: spa-2nx3
status: open
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

