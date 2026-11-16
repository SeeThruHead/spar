---
id: spa-690t
status: open
deps: []
links: []
created: 2026-11-16T05:04:23Z
type: task
priority: 2
assignee: Shane Keulen
tags: [parity]
---
# Durable stores across tabs, and unreadable outbox items

A durable store assumes one writer: two tabs on the same store would both assign sequence numbers and overwrite each other's log slots. Needs one sequencer (a Web Lock around append, reading the last slot from storage) and applying other tabs' entries as they arrive. Also: an outbox item on the device that no longer decodes stops the outbox layer from starting; it should be set aside as a dead letter with the reason instead.

## Acceptance Criteria

Two tabs editing the same durable store converge after both act; a corrupt outbox item shows in dead letters and the app starts.


## Notes

**2026-11-16T06:06:10Z**

Half done: an outbox item on the device that no longer decodes is set aside as a dead letter (channel 'unreadable', with its raw text) and the app starts. Not done: durable stores across tabs. A durable store still assumes one writing tab; it needs one sequencer (a Web Lock around append that reads the last slot from storage) and applying other tabs' entries as they arrive. Left open and listed in docs/gaps.md and the release report.
