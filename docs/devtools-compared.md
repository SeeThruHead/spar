# Spar's devtools beside Foldkit's

Foldkit's side is read from the installed package, `foldkit` 0.170.0: its README and the devtools
protocol it ships (`dist/devTools/protocol.d.ts`), which lists every request its MCP server
answers. Nothing here comes from running Foldkit's overlay by hand, so its look and feel is not
compared, only what it can do.

"Same" means Spar does the same job. "More" means Spar does it and something Foldkit's protocol
has no request for. "Less" means Foldkit does something Spar does not yet.

## In the page

| Foldkit                                         | Spar                                                                                                                                 |      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| Message history                                 | "Everything that happened": store actions, UI state changes, route changes, data arriving and backend calls in one order             | More |
| The Model at any point                          | Every store's state and all UI state at any moment, shown by the app itself and not only in a panel                                  | Same |
| Commands a Message returned                     | The trace of each moment: the spans of what the action caused, in the page and in the backend                                        | More |
| Mount start and end events                      | The inspector: pick a component on the page and read its place, props, UI state, services, recovered failures and what changed in it | More |
| Time travel (replay to a keyframe, then resume) | Jump to any moment, step earlier and later, go back to now                                                                           | Same |
| No request for it                               | Fork: carry on from a past moment in a new branch, keep the original, switch between them                                            | More |
| No request for it                               | A waterfall of one action across the page and the backend, with no collector, Tempo or Jaeger running                                | More |
| No request for it                               | Outbox: what is waiting to be sent and what could not be, with retry and discard                                                     | More |
| No request for it                               | Export a store's log as JSON, or load one to see where it leads                                                                      | More |
| Shown while the Vite dev server is active       | Added by the Vite plugin on the dev server only; a production build is checked to hold no devtools code                              | Same |

## For agents

Each row is one request in Foldkit's protocol and the Spar tool that does the job. Spar's tools
are served over MCP and answer from a shell through the CLI.

| Foldkit request                      | Spar tool                                                                   |      |
| ------------------------------------ | --------------------------------------------------------------------------- | ---- |
| `GetModel`                           | `get_state` for a store, `get_ui_state` for all UI state                    | Same |
| `GetModelAt`                         | `travel_to` (one store) or `rewind` (the whole app), then `get_state`       | Same |
| `GetInit`                            | `travel_to` with the seq before a store's first action                      | Same |
| `ListMessages`, `GetMessage`         | `get_log` for a store, `get_timeline` for everything                        | Same |
| `CountMessagesByTag`                 | `count_moments`                                                             | Same |
| `DiffModels`                         | `diff_states`: the paths that differ between two of a store's actions       | Same |
| `DispatchMessage`                    | `run_action`; `set_ui_state` for UI state                                   | Same |
| `DispatchMessages` (several at once) | `run_actions`                                                               | Same |
| `GetMessageSchema`                   | `get_actions`: each action's name and the JSON Schema of its payload        | Same |
| `ListKeyframes`, `ReplayToKeyframe`  | `get_timeline` and `rewind`; every moment can be returned to, not only some | Same |
| `Resume`                             | `rewind` with null                                                          | Same |
| `GetRuntimeState`                    | `get_timeline` gives the moment being shown; `list_branches` the branch     | Same |
| `ListRuntimes` (several open tabs)   | `list_pages` and `use_page`                                                 | Same |
| No request for it                    | `step`: one moment earlier or later, with every span of that moment's trace | More |
| No request for it                    | `fork`, `list_branches`, `switch_branch`                                    | More |
| No request for it                    | `get_trace`: the spans of a trace                                           | More |
| No request for it                    | `list_components`, `get_component`: the mounted components and their data   | More |
| No request for it                    | `load_log`: replay another log in a store                                   | More |
| No request for it                    | A CLI for all of the above                                                  | More |

## Where Spar is behind

Nothing in Foldkit's protocol is without a Spar tool now. The three that were missing (an action's
payload Schema, several actions in one call, choosing between open pages) are `get_actions`,
`run_actions`, and `list_pages` with `use_page`.
