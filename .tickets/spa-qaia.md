---
id: spa-qaia
status: closed
deps: [spa-ybv7]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 2
assignee: Shane Keulen
tags: [parity]
---
# Forms: field state, Schema validation, submit as a command

Form.make(schema) gives typed fields (value, touched, error as reactive values), validation through Schema, submit that decodes then runs a command, disabled and pending state, server errors mapped to fields.

## Acceptance Criteria

A form in the demo with sync and async validation, tested by role.


## Notes

**2026-11-16T05:14:43Z**

Done: Form module. Form.make(schema, initial) in a component's Effect; form.field(name) gives a typed field (value, error, invalid, change, touch); Form.text(field) and Form.checkbox(field) are the props to spread on an input. A field's problem shows once the field has been left or a submit was tried; a problem with the whole form shows in form.error after a submit. form.submit(onValid) decodes with the Schema and only then runs the Effect with the decoded value; while that runs, form.submitting is true and further submits are ignored (the send runs in the app's scope so the pending flag is seen at once). Failing with Form.Rejected({ message, fields }) puts the server's messages on their fields until each field changes. Decisions: form values are UI state inside the form, changed only through the field handlers; field access is form.field(name), not a mapped record, because a per-key record cannot be built without a cast. The proof app ticket uses it in a real screen.
