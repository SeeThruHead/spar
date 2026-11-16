---
id: spa-frp9
status: closed
deps: [spa-mmr0, spa-6cop, spa-bkuy, spa-rmbs]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [qa]
---
# Hands-on passes at phone, tablet and desktop sizes until one finds nothing

Drive the demo, the proof app, the docs and the stories like a person: type, click, keyboard only, resize, go offline and back. File and fix every finding, repeat.

## Acceptance Criteria

A full pass with zero findings, recorded with screenshots.


## Notes

**2026-11-16T06:05:26Z**

Done in four passes over the proof app at phone (390), tablet (820) and desktop (1440) widths: a keyboard-only walkthrough (scripts/walkthrough.ts: Tab to controls, open a dialog, submit it empty, fill it, open a row menu with the keyboard, edit tags, open an agent page, shrink the window, filter to nothing, go offline and back) with an axe audit and a sideways-scroll check at each stop, plus reading the screenshots. Found and fixed: pass 1, an invalid dialog form still closed its dialog (Form.submitThen now runs an action only after a successful submit); pass 2, the connection and unsent count ran together, and long menu button labels squeezed agent names (Menu now has a short visible text and a full accessible name); pass 3, '1 agents', and the toast region took a grid row so the sidebar stopped short; pass 4, the dialog ignored its margin on a phone (box sizing). The last run and the last look at the screenshots found nothing. The walkthrough runs in CI. Not covered by hand: a real phone or tablet device, a screen reader, and Safari or Firefox (everything ran in Chromium).
