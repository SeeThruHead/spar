---
id: spa-k35m
status: closed
deps: []
links: []
created: 2026-11-19T15:15:37Z
type: feature
priority: 0
assignee: Shane Keulen
tags: [goal5]
---
# Goal 5: the natural example first: a prop from a store, a child query that uses it

Design constraint in goal-5.md. A parent reads a store value and passes it as a prop; the child, with its own store, declares a query using that prop. No fragments, compiler step, loader file or dependency list. Spar works out the dependency from where the reactive value came from, lifts the query and waits only on a real dependency. Write it first, put it first in the docs, and say which line cannot be supported if any.

