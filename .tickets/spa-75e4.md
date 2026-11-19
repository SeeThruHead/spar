---
id: spa-75e4
status: closed
deps: [spa-fa5x]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 2
assignee: Shane Keulen
tags: [goal3]
---
# Same components on the server by layers: HTML renderer layer, server stores reading data directly, streaming, Schema-encoded snapshot for hydration

No directives; the layer decides. Demo rendered on the server, hydrated in the browser, one trace spanning both.

## Acceptance Criteria

Browser test in three engines; trace test spanning server render and hydration.


## Notes

**2026-11-19T04:55:05Z**

Done. Framework: Self.layerFrom(load) starts a store from data loaded where it runs (the server reads its database); Self.layer() in the browser starts from the state the server sent (the Store.Seed reference) and falls back to initialState; Server.render gives the HTML and a Dehydrated state (each store's state encoded by its Schema, the UiState tree, and the render span's trace); Server.stateScript and Server.renderToStream({ open, close, end }) send the document in parts with the state after the page; App.hydrate reads the state script, seeds stores and UI state and continues the server's trace (span App.hydrate, child of Server.render). No directives anywhere: the same Shop component runs in both places, and the layers given decide where its data comes from (apps/ssr/server/layers.ts reads the database, apps/ssr/src/client.ts asks over HTTP). Decided: the renderer is chosen by the entry that runs the component (Server.render or App.hydrate / App.mount), stores and services by layers; a separate renderer service would add a way to mis-wire it and nothing else. Decided: streaming sends the document's opening before the page is drawn and the page in one piece; parts of the page are not streamed out of order. Proof: apps/ssr (the shop), ssr:browser in three engines: the opening arrives before the page is drawn, the browser's store is empty by itself yet shows the server's three items, the server's nodes are kept, and GET /spans/<trace> holds Server.render, Database.items, Database.crates and the browser's App.hydrate as a child of the render. Unit tests in packages/spar/test/dehydrate.test.ts. Each DOM event is now the root of its own trace (it used to become a child of the new App.mount span).
