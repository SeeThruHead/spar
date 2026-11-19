---
id: spa-0cal
status: closed
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

**2026-11-19T04:16:50Z**

Stage 2 done and pushed: the tools panel has an Inspector. Pick a component puts a veil over the page; moving over it highlights the view under the pointer (a box in its own layer over the page, with the view's name), clicking picks it. The pane shows the name, where it is in the tree, its props as plain values (reactive ones as they are now), the UI state under its path, the services its Effect uses (named by a dev transform in the Vite plugin, transform/services.ts, which rewrites View.connect( and View.taking( into View.described([...])...) and a list of what changed in it after each action, linked to the moment. Details are computed at the moment of each change (a synchronous observer), not later. sidebar:devtools drives all of it in a real browser and writes four screenshots to apps/sidebar/artifacts (devtools-timeline, -picking, -inspecting, -changes). Left: store selectors named as the source of a reactive prop; failures a component recovers shown in the pane; visual polish and story entries for the tools; everything over MCP (the MCP ticket).

**2026-11-19T04:20:47Z**

Done. Added: each prop that is, or is made from, a store selector says so (sidebar/BoardStore . board); the failures a component recovers from and the view that shows each; the tools carry their own scoped styles. Decided: the showcase is the real app, not separate stories: moon run sidebar:devtools drives the tools in the sidebar app through the Vite dev server in three browsers and writes desktop screenshots of each mode to apps/sidebar/artifacts (devtools-timeline, devtools-picking, devtools-inspecting, devtools-changes). Still to come in their own tickets: the trace viewer (spa-76bl) and everything the overlay shows over MCP (spa-vgha).
