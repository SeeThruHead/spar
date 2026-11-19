---
id: spa-76bl
status: closed
deps: [spa-fa5x, spa-o38z]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 2
assignee: Shane Keulen
tags: [goal3]
---
# Trace viewer in devtools: waterfall of an action's browser and backend spans

Server spans from the server's span buffer in dev or Tempo through the dev endpoint, drawn with the browser spans; backend errors on their spans.

## Acceptance Criteria

Story test and screenshot; a test joins both sides by trace id.


## Notes

**2026-11-19T04:44:42Z**

Done. The tools keep the page's spans in a span buffer (spar/devtools/spans, provided around the app by the devtools client) and each moment in the log has a Trace button. The Trace panel draws one waterfall for that action: every span with its name, which side it ran on, how long it took, nesting by parent, a bar placed on the trace's time line, and failed marked in red. Backend spans come from each backend's GET /spans/:traceId through Vite's own proxy: sparDevtools({ backends: [url] }) adds /@spar/backend/<n> proxies and tells the page how many there are. apps/sidebar/vite.config.ts takes SIDEBAR_BACKEND to run the dev server against the real backend. sidebar:devtools now starts the backend, starts an agent in the page, opens that action's trace and asserts the waterfall shows the page's event and both backend attempts (the failed one and the retry); screenshot apps/sidebar/artifacts/devtools-trace.png.
