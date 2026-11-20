---
id: spa-1lik
status: closed
deps: []
links: []
created: 2026-11-20T07:36:38Z
type: feature
priority: 2
assignee: Shane Keulen
tags: [goal7, impossible]
---
# Make replaced typing impossible: a text input's value may only be UI state or a form field

SPAR_TYPING_REPLACED is caught at run time when an input's value is bound to a reactive value something else changes (a store selector, a query's data) while the user types. In the JSX types, value on input/textarea (type text-like) would accept only UiState<string>, Form.Field text bindings, or a plain string for an uncontrolled default, not an arbitrary Reactive<string>. A read-only display can use readonly with a Reactive. Survey the repo's inputs first; corpus apps may bind value to selectors.


## Notes

**2026-11-20T07:37:12Z**

Survey: 5 inputs bind value. Blockers: Form.text gives value as a plain Reactive (not UI state), and a hidden input (ListboxView) legitimately binds a parent's value, so the JSX types would need to tell input types apart (props keyed on the type literal) or Field.value would need to become UI-state backed.

**2026-11-20T07:44:26Z**

Done: JSX value on input and textarea takes string | Typed<string> (UI state, or a form field's value, marked by typed()); a hidden input and a readOnly textarea take any reactive. Found and fixed a real case: the showcase's reset delay input was bound to a store selector. Proof input-bound-to-a-store.tsx.
