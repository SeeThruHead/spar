---
id: spa-hcbj
status: closed
deps: []
links: []
created: 2026-11-19T23:47:34Z
type: feature
priority: 1
assignee: Shane Keulen
tags: [goal6, corpus]
---
# Mistake: a needless wait between queries is reported where it is made

Corpus: Haiku chained each query's input to the previous query's value though the input was void. Report it with a code, the component and the fix when it is asked for, not only when a trace is looked at. Told-to-make-it variant is already caught as SPAR_COMPONENT_WAITED.

