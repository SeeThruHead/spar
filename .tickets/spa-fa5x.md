---
id: spa-fa5x
status: in_progress
deps: [spa-s5y5]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 1
assignee: Shane Keulen
tags: [goal3]
---
# Tracing front to back: spans for mount, command, store change, render and every RPC, W3C context across the network

Browser spans through a proxy route in the app's server to Alloy; one trace for a click and the backend work it causes. Backend error types in a shared RPC contract appear in the component's error type.

## Acceptance Criteria

A trace test: a click produces one connected browser-to-server trace; an unhandled backend error is a compile error (forbidden proof).


## Notes

**2026-11-19T04:06:29Z**

From the plugin ticket: the Vite plugin (packages/spar/src/devtools/vite.ts) still needs configureServer with an endpoint that takes browser spans (OTLP JSON), keeps a buffer per trace id and forwards to the configured collector (Alloy http://192.168.0.29:4318), and options for the backends' OTLP or Tempo endpoints.

**2026-11-19T04:34:25Z**

Done so far: (1) the outbox saves the trace of what caused each item and continues it on delivery, even after a restart; (2) every DOM handler runs in a span, so the event is the root; (3) apps/sidebar has a shared Effect RPC contract (src/api.ts), a real backend (server/handlers.ts, scripts/backend.ts: RPC at /rpc, static files, /otlp proxy, OTLP export when OTLP_ENDPOINT is set, GET /spans/:traceId) and Server.layerRemote; the page uses the backend when it is served by it; (4) spar/devtools/spans: a span buffer for any Effect backend (wraps the current tracer) with a route; (5) apps/sidebar/test/trace.test.ts starts the backend as a process, mounts the real app, submits the start form and asserts one trace across both sides, with the backend spans parented by browser spans. Found and fixed on the way: a keyed list read its first value before it started listening, so a change in between was lost (regression test in renderer.test.ts). Left: the backend error type in a component's error type with a forbidden proof; the Vite plugin's endpoint for browser spans; render and store-change spans; exporting to Alloy checked once by hand.
