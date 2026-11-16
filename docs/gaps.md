# Spar: what the core still needs to match Foldkit

In the order I would build them.

1. **Router.** Foldkit has typed two-way routes from parser combinators. Here the URL should be a store (navigation is a command, the current route is a selector) plus one more function beside mapBy and when that mounts the component for the current route.
2. **Events beyond a single element.** Foldkit's Subscriptions cover document and window events and timers. This core cannot yet close a dropdown on an outside click or Escape, cannot call preventDefault (handlers run just after the event, in order), has no typed way to focus a node (the one refs enhancer is not written), and names events after the DOM (onKeydown, not onKeyDown).
3. **A testing package.** Foldkit ships Story (drive update, resolve commands) and Scene (drive the view by role). The pieces exist here: stores are tested through commands, selectors, the log and the outbox with TestClock, and components are mounted in happy-dom and queried by role. They need to become a small spar/testing module so a test reads as a spec.
4. **DevTools and time travel.** Every action is already logged and Store.replay rebuilds state from any prefix of the log. Missing: an overlay that shows the log, the state and the outbox, stepping backwards, and the MCP server Foldkit has for agents.
5. **Persisting app state.** Only the outbox survives a reload. Stores need an opt-in durable log or snapshot (the payloads are already Schema encoded), and the outbox needs ordered delivery per channel, a limit on retries with a place for items that never go through, and one owner when two tabs are open.
6. **Crashes and telemetry.** Typed errors are handled by recover. A defect in a component's Effect has no fallback view and no report callback yet. withSpan creates spans, and nothing exports them to the homelab's Grafana stack yet.
7. **Renderer completeness.** No SVG namespace, no style or class objects, a short list of typed attributes, no warning for duplicate keys, one DOM write per change instead of one batch per frame, and mapBy finds each row's item by scanning the list.
8. **Data and form helpers, and a component kit.** Foldkit has async data, a query cache, field validation and @foldkit/ui. None of that exists here; pending and recover cover the first load only.
9. **Development loop.** Foldkit's Vite plugin reloads the page and restores the Model. The same is possible here by replaying the action log after a reload. There is also no scaffolder, no lint or git hooks, and no Storybook in this prototype.
10. **Server rendering and hydration.** Foldkit and Weft both have it. It is last because it changes the renderer the most, and it is only worth doing if an app needs it.
