# Coming from Foldkit

Both are built on Effect and both keep app state changes explicit and replayable. The differences:

| Foldkit                                              | Spar                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| One Model for the whole app, described by a Schema   | Stores for app state, `UiState` for a component's own state (open menus, what was typed) |
| Messages and one `update`                            | Store actions with a reducer each; commands are `store.commands.<name>(payload)`         |
| Commands returned from `update`                      | `Store.after(action, effect)` and `Store.outbox(action, send)` beside the store          |
| `view(model, h)` re-runs and a virtual DOM is diffed | A view runs once; reactive values update single nodes                                    |
| `h.div([...], [...])`                                | JSX                                                                                      |
| Subscriptions as a function of the Model             | Streams in a `withEffect` enhancer, released on unmount                                  |
| Submodels and OutMessages                            | Components and props; a child's handlers are Effects the parent passes in                |
| Routes from parser combinators                       | `Router.route(path, Schema)` values and `Router.outlet`                                  |
| `foldkit/story` and `foldkit/scene`                  | Stores tested as services; components tested with `spar/testing` by role                 |
| Crash view                                           | `View.crash` per part, plus `App.CrashReporter`                                          |
| DevTools overlay and MCP server                      | Devtools from the Vite plugin, an MCP server and a CLI (`docs/devtools-compared.md`)     |
| Server rendering and hydration                       | `Server.render` and `App.hydrate`, the same components chosen by layers                  |

## Porting a screen

`apps/sidebar` is a port of a real Foldkit screen. What moved where:

- Model fields that were only about the screen (`menu`, `tagging`, `naming`, the filter text) became
  `UiState` or form state inside the component that owns them. They are no longer saved or replayed.
- Model fields that are real data (agents, projects, which sections are collapsed) became a durable
  store.
- Each Message that changed data became a store action. Messages that only changed screen state
  became `UiState.set` in a handler.
- The pure functions that turned data into sections moved over unchanged in spirit
  (`src/domain.ts`) and are tested the same way.
- `update` tests became store tests; scene tests became `spar/testing` or browser scenarios.

What you give up: one Model value holding everything. The one log, time travel over stores and
screen state together, forking and server rendering are all there.
What you get: rows that update without re-running a view, local state without ceremony, and errors
and services checked at the mount.
