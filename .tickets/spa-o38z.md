---
id: spa-o38z
status: open
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

