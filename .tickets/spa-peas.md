---
id: spa-peas
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Server rendering and hydration

Not started.

## Acceptance Criteria

A component renders to HTML on the server and hydrates in the browser without re-creating nodes; tests and docs.


## Notes

**2026-11-16T08:36:36Z**

Done. Server.renderToString(Component, { layer }) runs a component on a server and gives its HTML: loading parts are waited for, overlays are left out, window events and listeners do nothing there, and lists and adjacent texts carry small comment markers. App.hydrate(Component, { target, layer }) takes that page over: the renderer walks the existing nodes with a cursor (in internal/dom.ts) and claims them instead of creating, repairs anything that does not match, and removes leftovers. App.mount and App.hydrate take shown, an effect run when the first picture is up. Tests: exact HTML for a page with every kind of child; hydration compared against a fresh mount, node identity kept, seven kinds of spoiled HTML repaired; and apps/ssr, a Bun server plus client, whose browser test holds the script back, marks every node the server sent, lets the app take over and checks none were made again, in Chromium, Firefox and WebKit. Decisions: form values are written as attributes on the server and set as properties on take-over; a select's chosen option is only set on take-over; there is no streaming and no partial hydration.
