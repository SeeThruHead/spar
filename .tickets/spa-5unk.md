---
id: spa-5unk
status: in_progress
deps: [spa-pa0r]
links: []
created: 2026-11-19T03:35:14Z
type: task
priority: 0
assignee: Shane Keulen
tags: [goal3]
---
# Schema only 2: view and component props are declared with a Schema

Schemas for reactive values, actions, elements and handles so a props Schema can describe everything a view takes; views are made from a props Schema.

## Acceptance Criteria

A view without a props Schema does not compile or is rejected by the build check; all apps converted.


## Notes

**2026-11-19T03:40:23Z**

Step 1 done: Props module (Reactive, State, Action, Element, Handle, Callback kinds; shown/allShown for the inspector), View.make(name, fields, draw), build check lets JSX be the body of View.make. Left: View.connect takes the outer props Schema; convert every view in every package to View.make; then the build check rejects a plain function view (proof by build) and a connect without a Schema (proof by types).

**2026-11-19T03:46:28Z**

Step 2 done: every view in ui, demo, sidebar, stories, ssr, bench, the devtools panel and the framework's tests is View.make with a props Schema. Props.Handler(event, tag?) types currentTarget when the element is named. Memory gate unchanged (1.22 times Solid). Left: connect takes the outer props Schema; the build rule that rejects a plain function view; the two proofs; docs.

**2026-11-19T03:47:41Z**

Step 4 done: the build check rejects JSX outside View.make (rule views-need-a-schema), proof view-without-a-schema.tsx. Left: connect takes the outer props Schema (with a types proof); docs samples still show plain function views (docs/*.md) and must be rewritten.

**2026-11-19T03:51:10Z**

Step 3 done: View.connect takes a props function with no argument; a component with outer props is View.taking(fields, props). Proof: component-props-without-a-schema. The ui Dialog now takes its content as an unmounted child (View.child(...)) and only onClose as a prop, because a props type cannot be derived from a generic Schema. Left for this ticket: rewrite the docs samples (docs/*.md still show plain function views and connect with typed parameters).
