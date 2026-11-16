---
id: spa-4x1c
status: closed
deps: []
links: []
created: 2026-11-16T06:19:58Z
type: task
priority: 2
assignee: Shane Keulen
tags: [gaps]
---
# Devtools: log export and import, outbox view, MCP server

The panel only steps through this session's actions.

## Acceptance Criteria

A log can be exported and replayed; the outbox is visible; an MCP server exposes stores and actions to agents; tests cover each.


## Notes

**2026-11-16T08:21:09Z**

Done in two commits. In the panel: actions restored from the device can be stepped to (a store builds its steps at start when devtools are attached); Export log gives a store's actions as JSON text and Load log replays a pasted log from the first state without touching the live state; an Outbox section shows what is waiting and what could not be sent, with Retry and Discard. For agents: packages/devtools-mcp is a small Bun server. A page that provides DevtoolsLink.layer reports its stores to it over Effect RPC (HTTP, streamed commands back to the page), and an agent connects over MCP (Effect's McpServer) for list_stores, get_state, get_log, travel_to, run_action and load_log. Tests: unit tests in spar for the panel and store parts; an integration test that starts the real server, a real page link and Effect's MCP client (100% coverage of the package); and the demo browser test has an MCP client run an action that the page then shows, in Chromium, Firefox and WebKit. Decisions: tools speak for the page that reported last; a page whose server is not running retries every two seconds and logs only at debug level; nothing here is started by the app itself, it is a dev command.
