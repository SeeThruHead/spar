---
id: spa-1yfb
status: closed
deps: [spa-juqy]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [parity]
---
# Router: typed, nested routes with data loading through Effect

The URL is a store: navigation is a command, the current route is a selector. Route definitions are Schema based and two-way (parse and build). Route.outlet mounts the component for the current route with its own scope; nested routes; loaders are the component's props Effect so pending and recover apply; typed links; scroll and focus restoration.

## Acceptance Criteria

Nested demo with params and a failing loader; back and forward work; a link to an unknown route is a compile error.


## Notes

**2026-11-16T05:10:40Z**

Done: Router module. Router.route(path) types its params from the path (/threads/:id), or from a Schema over path params plus query params (so a number or a literal union is decoded and a URL that does not decode does not match). route.build and route.parse are inverses (property tested; lone surrogates are replaced and the two dot names cannot live in a URL path). A path ending in /* is an open route: it matches everything under the prefix and stays mounted while inner pages change, which is how nested layouts work (the layout's Effect calls Router.outlet again). Router.outlet({ routes: [Router.on(route, Page)...], otherwise }) mounts the page for the current URL in its own scope; pages are ordinary components, so loading uses View.pending and View.recover. The Router service has location, go, replace, back and link(route, params) which gives href plus a click handler that leaves modified clicks to the browser. Router.focusOnChange(handle) moves focus after a navigation. layerBrowser uses the History API and scrolls to top on a push; layerMemory is for tests. Decisions: routes are values and an outlet is an ordered list, not one route tree type; a page gets its params as plain props and is remounted when they change (query included); the URL is a service, not a Store. Proofs added: navigating without a required param, and a page whose props are not the route's params. Property test found two bugs that are fixed (a lone surrogate threw; an id of * was dropped).
