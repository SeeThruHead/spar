---
id: spa-mmr0
status: closed
deps: [spa-1yfb, spa-qaia, spa-is9o, spa-lb48, spa-i5s0, spa-ilar]
links: []
created: 2026-11-16T04:22:57Z
type: task
priority: 1
assignee: Shane Keulen
tags: [app]
---
# Proof app: one non-trivial Foldkit screen ported end to end

Pick one screen from Hangar or sth-ui (read only), port it into apps/ in this repo with router, forms, base components, persistence, outbox and telemetry. Record what was harder or easier than Foldkit.

## Acceptance Criteria

The screen works end to end with browser tests written as Gherkin.


## Notes

**2026-11-16T05:56:34Z**

Done: apps/sidebar ports Hangar's agent sidebar (read only reference: apps/client/src/client/pages/sidebar): sections for pinned, loose chats and each project, ordered by who needs attention; a filter over names and tags; collapsing sections; a menu per agent (pin, edit tags, move to a project); new project and start-agent dialogs with validated forms; a routed agent page with a loading state and a recovered not-found error; a durable store, an outbox that sends started agents to a stand-in server (which refuses every other attempt), the connection state, toasts, and OTLP export through the dev server. Not ported: drag and drop reordering and keyboard reordering. Domain logic (src/domain.ts) has 100% coverage with property tests. Nine scenarios in features/sidebar.feature run in Chromium at phone and desktop sizes through a small step runner in scripts/features.ts (decision: no playwright-bdd; the runner is under 150 lines and reads the same Gherkin). Against Foldkit: easier were per-row menus and dialogs (local UI state instead of Model fields and messages such as menu, tagging and naming), list rows that update without re-running a view, and persistence plus offline sending, which needed no code beyond the layer; harder were combining two reactive values (Reactive.zip was added for the filter plus board), dialogs that must mount their content fresh (the kit's Dialog now wraps a content component), and reading 'which agent is being edited' through UI state rather than a single Model. Ids are branded Schemas.
