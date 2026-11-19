---
id: spa-jfgv
status: closed
deps: []
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 0
assignee: Shane Keulen
tags: [goal3]
---
# Central UiState service: one tree of all UI state by component path

UiState.make still feels local, but every piece registers in one UiState service under its component's path from the root. One inspectable tree; restore and time travel; removed on unmount.

## Acceptance Criteria

A test reads the whole tree by path, sets a value from outside, and sees the screen follow; unmount removes the branch.


## Notes

**2026-11-19T03:34:40Z**

Done. UiState.make(name, schema, initial) registers in one tree (UiState.Tree) under the component's path: view names from the root, a row's key in brackets, a number when two share a place or a name. snapshot, changes, put and restore; values for components not on screen wait as seeds. Decided: a repeated name is numbered, not an error, because helpers such as Tooltip.make create state inside the caller's component. Memory gate unchanged at 1.22 times Solid.
