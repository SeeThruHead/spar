---
id: spa-qaia
status: open
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

