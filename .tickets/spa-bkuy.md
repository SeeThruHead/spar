---
id: spa-bkuy
status: closed
deps: [spa-is9o]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [testing, ui]
---
# Stories with play tests for every base component, run in a browser

A story runner app and a browser test task that mounts every story, runs its play function and an axe check, at phone and desktop sizes.

## Acceptance Criteria

All stories pass in CI.


## Notes

**2026-11-16T05:51:07Z**

Done: apps/stories is a Spar app (router shell, one page per component: form controls, tabs, menu, dialog, toasts) and scripts/play.ts drives every story in Chromium at phone, tablet and desktop sizes: an axe audit (WCAG 2 A and AA) before and after the play steps, the play steps themselves by role and keyboard, a check that the page does not scroll sideways, and a screenshot per story and size in apps/stories/artifacts. Runs in CI (stories:play). It found and fixed: Tab left a modal dialog instead of wrapping (Overlay.modal now wraps Tab and Shift+Tab inside its layer), and the toast list lost its list semantics under role=status. Router.outlet now accepts pages that need different services. Decision: a story is a route in the stories app plus a play function in the runner, not a new Story type in the framework.
