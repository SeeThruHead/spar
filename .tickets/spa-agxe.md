---
id: spa-agxe
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Drag reordering in the proof app

The original screen has drag reordering; the port does not.

## Acceptance Criteria

Agents and projects reorder by drag and by keyboard, with scenarios.


## Notes

**2026-11-16T08:04:58Z**

Done, following the original screen (read only: sth-hangar apps/client/src/client/pages/sidebar): agents keep the order you give them instead of being sorted by state. An agent can be dragged onto another agent (it lands just before it, taking that section) or onto a section (it lands last there); projects can be dragged above one another. The same moves exist without dragging: Move up and Move down in each agent menu, and up and down buttons on each project. The order is part of the durable store, so it survives a reload and reaches other tabs. Pure placing logic is in domain.ts with tests at 100% coverage; four new Gherkin scenarios pass in Chromium, Firefox and WebKit. Uses the browser drag and drop events, which do not fire for touch on every phone; the keyboard and menu moves cover that.
