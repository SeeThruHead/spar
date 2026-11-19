---
id: spa-o38z
status: closed
deps: [spa-dh7h]
links: []
created: 2026-11-19T03:26:28Z
type: task
priority: 1
assignee: Shane Keulen
tags: [goal3]
---
# Devtools as a Vite plugin: bundle injected in dev, nothing in production

spar/devtools Vite plugin injects the devtools bundle, inspector overlay and trace viewer in dev and runs a dev-server endpoint collecting browser spans and proxying backend telemetry. Production build has zero devtools code.

## Acceptance Criteria

A test builds for production and greps the output; dev mode shows the panel.


## Notes

**2026-11-19T04:06:29Z**

Done. spar/devtools/vite (sparDevtools, dev server only) injects spar/devtools/entry before the app; that installs a hook App.mount reads, which provides Devtools.layer around the app's own layer and mounts the tools (a docked panel: the one log with jump, earlier, later, back to now, then the stores) in their own UiState tree with no recorder, so the tools never appear in the app's log. Devtools moved out of the main entry to spar/devtools and the packages are marked side-effect free: the first production check found devtools views in the bundle, because Schema-made views are module-level calls. sidebar:production (part of check) builds for production and fails if any devtools marker is in the output; sidebar:devtools runs the Vite dev server and, in a real browser, opens the tools, logs an action, rewinds and returns (green in Chromium, Firefox and WebKit, in CI's browser job). Moved to the tracing and trace viewer tickets: the dev-server endpoint that collects browser spans and proxies backend telemetry.
