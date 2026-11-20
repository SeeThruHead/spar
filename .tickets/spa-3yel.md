---
id: spa-3yel
status: open
deps: []
links: []
created: 2026-11-20T07:33:24Z
type: feature
priority: 2
assignee: Shane Keulen
tags: [goal7, ssr]
---
# Stream finished HTML for late query data, not only data scripts (goal-7 backlog item 6)

Today renderInPieces sends the first draw (queries loading), then each store change as a data script the client JS applies. Finished HTML in pieces needs: (1) the HTML renderer to mark each composed component's output with comment markers carrying an id; (2) after each data change, re-render, compare per component, and send the innermost changed components' HTML as <template> plus a tiny inline swap script (not the app bundle); (3) the hydrator to accept and skip those markers; (4) the client bundle to load after the last piece, or adopt swapped DOM. View.pending is not the boundary: queries never block a component's enhancers, so pending boundaries do not wait on the server.

