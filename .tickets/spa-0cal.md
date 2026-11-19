---
id: spa-0cal
status: in_progress
deps: [spa-o38z]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 1
assignee: Shane Keulen
tags: [goal3]
---
# Inspector overlay: pick a component, see its props, selectors, UI state, services and unhandled errors, and how they changed

Hover or pick on the page; per-component data with a timeline linked to the action that changed it.

## Acceptance Criteria

Story tests and desktop screenshots of each mode.


## Notes

**2026-11-19T04:09:39Z**

Stage 1 done: internal/inspect.ts. When an Inspecting is installed (a cell, absent by default), every View.make call registers {id, name, fields, props} and marks its own root elements with data-spar-view=id (an inner view's mark is kept), and every component adds its path and the services it was described with. View.described(services).connect / .taking is what the dev plugin will rewrite View.connect / View.taking calls into, after reading the yield* of service tags from the source (services are types, so they come from the build, not the run). Decided: unhandled error types cannot exist on a mounted component (mount needs none), so the inspector shows which failures are recovered and by which view. Left: install the Inspecting from the devtools client; the overlay (hover, pick, highlight box); the inspector pane (props, UI state under the path, services, changes per moment for the picked component); the plugin transform for services; story tests and screenshots.
