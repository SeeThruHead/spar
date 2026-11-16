---
id: spa-690t
status: closed
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

**2026-11-16T06:30:01Z**

Done. New Tabs module (alone by default, Tabs.layerBrowser uses Web Locks and one BroadcastChannel). A durable store command: writes an intent to the device synchronously, takes the store's cross-tab lock, applies what other tabs recorded since (from a small head key, or the snapshot if it fell behind a fold), records its entry at the next seq, removes the intent, tells other tabs. Idle tabs follow announcements. A tab holds a presence lock; the next tab to open adopts intents whose tab is gone (found by a scenario: collapse then immediate reload lost the action once the lock made saving asynchronous). Tests: two stores on one KeyValueStore with a fake browser, a property test over any interleaving, the browser layer against a queueing lock stand-in, and two real tabs in the demo's browser test. Decision: an adopted intent this version cannot carry out is dropped and reported as Store.Abandoned rather than stopping the app.
