---
id: spa-cwni
status: open
deps: []
links: []
created: 2026-11-19T23:47:34Z
type: feature
priority: 1
assignee: Shane Keulen
tags: [goal6, corpus]
---
# Mistake: the same call made several times at once is reported

Corpus: data passed down as props led to nine duplicate calls that nothing flagged. Report identical backend calls in flight together, with a code and the fix (ask a query).

