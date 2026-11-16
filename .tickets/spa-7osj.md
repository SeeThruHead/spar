---
id: spa-7osj
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Overlays: edge avoidance, Tooltip, Popover, custom Select

Menus do not avoid the left and right edges; no Tooltip, no Popover; Select is native only.

## Acceptance Criteria

Components exist with stories, play tests and axe audits; menus stay on screen at every edge.


## Notes

**2026-11-16T08:00:21Z**

Done. Overlay.position now also chooses a side: from the left edge or the right, never past the window, and no taller than the room there is. New in the UI kit: Popover, Tooltip (Tooltip.make gives props for the trigger and the bubble element) and Listbox (a select drawn by the kit with arrows, Home, End, type-ahead, Enter and Space, tied to its list with aria-controls, and a hidden input). Each has unit tests at 100% coverage and a story whose play test runs with an axe audit at three sizes in Chromium, Firefox and WebKit and checks the layer stays on screen. Events.cancel(event) was added for handlers that only sometimes take a key over. Found on the way: a property equal to its default was never written, so tabIndex -1 on a list item did nothing in a real browser (happy-dom hid it); and focus after back or forward scrolled the page away from its restored position (Router.focusOnChange now focuses in place after history moves; Handle.focusInPlace).
