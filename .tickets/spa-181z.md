---
id: spa-181z
status: closed
deps: []
links: []
created: 2026-11-16T06:08:04Z
type: task
priority: 1
assignee: Shane Keulen
tags: [qa]
---
# Browser tests in Firefox and WebKit as well as Chromium

Run the demo browser test, story play tests, feature scenarios and walkthrough in all three engines, locally and in CI.

## Acceptance Criteria

All browser suites pass in Chromium, Firefox and WebKit in CI.


## Notes

**2026-11-16T06:34:55Z**

Done. A shared launcher (packages/browsers) picks the engine from SPAR_BROWSER. The demo test, story play tests, feature scenarios and keyboard walkthrough pass in Chromium, Firefox and WebKit, locally and in CI (verified in the CI log). WebKit's Linux build needs Ubuntu libraries this machine does not have, so it runs from the pinned Playwright container through podman and the tests connect to it; Chromium and Firefox run on the host. The benchmark, leak and memory checks stay Chromium-only because they read V8's heap.
