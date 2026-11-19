---
id: spa-22wc
status: closed
deps: []
links: []
created: 2026-11-19T22:36:27Z
type: bug
priority: 1
assignee: Shane Keulen
tags: [goal6, corpus]
---
# Corpus: a form's state is not in the log

From spar-apps (repro/form-not-in-log.md): Form.make keeps its state in a SubscriptionRef, so typing, touching and failed submits never reach the log or rewind.

