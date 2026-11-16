---
id: spa-lb48
status: closed
deps: [spa-msnp]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [parity]
---
# Store persistence and a production outbox

Opt-in durable action log or snapshot per store with schema versions (additive only). Outbox: ordered delivery per channel, retry cap with a dead-letter list the UI can show, attempt timeouts, one owner across tabs (Web Locks), offline detection.

## Acceptance Criteria

Reload restores state; two tabs deliver once; an item that never succeeds lands in dead letters; property tests for replay.


## Notes

**2026-11-16T05:04:32Z**

Done. Store: Tag.layerDurable({ state: Schema, compactAfter }) keeps the store on the device through KeyValueStore: each entry is written before the state changes, old entries are folded into one saved state after compactAfter entries, and a restart replays snapshot plus log. Saved data that no longer decodes fails the layer with Store.Unreadable. Entries carry a sequence number; commands are serialized; the in-memory log keeps the last 1000 entries. Outbox: it now owns delivery. Store.outbox registers a sender per channel; items go one at a time in sequence order; an item that fails maxAttempts times (default 8, each attempt timed out) is set aside with its reason in outbox.dead and can be retried or discarded; sending waits while offline; only the tab holding a Web Lock sends, and other tabs' items are picked up through a BroadcastChannel (Outbox.layerBrowser; the default environment is one tab, always online). Crash window: the outbox entry is written before the log entry, and a durable store applies outbox leftovers newer than its log on start, so a queued send is never missing from the state. Property test: any run of commands restores to the same state. Browser test covers reload and offline. Follow-up filed: durable stores across tabs and unreadable outbox items.
