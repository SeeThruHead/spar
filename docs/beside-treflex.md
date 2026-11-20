# Spar beside Treflex

Treflex is a runtime for front-end state and the work that runs on it (requests, timers, live
connections, multi-step flows), with Solid-style signals and bindings for React and Solid. This
page sets its model beside Spar's, from Treflex's own README and reference (`actions.md`,
`restart-and-records.md`). Both keep work out of components; they differ in where the work lives
and how two pieces of work on the same thing relate.

| Question                      | Treflex                                                                                                           | Spar                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where work lives              | On an entity in the state tree (an object with an `$Id`); it runs while no view shows it                          | On a store (`Store.Tag`): a reducer per action, and reactions (`Store.after`) for the async work                                                                                           |
| How state changes             | An action is a generator that writes the entity's draft directly                                                  | An action's reducer returns the next state; reactions send further actions                                                                                                                 |
| Reaching the outside world    | Yields declared effects; the runtime calls the implementation, or a stub in a test                                | Effect services in the reaction's requirements, provided as layers; a test provides other layers                                                                                           |
| Two actions on one entity     | Take turns: an action holds its entity until it finishes, so a second one waits                                   | Never wait for each other, on purpose; each command is decided at once against the current state                                                                                           |
| A repeat while the first runs | `leading` drops the repeat; `latest` stops the one running                                                        | `Store.afterLeading` refuses the repeat with a reason; `Store.afterLatest` stops the one running                                                                                           |
| Is it running?                | `inFlight(action, owner)`                                                                                         | A phase in the state (`phases`, `Store.during`), so "busy" is state the view and the reducers can read                                                                                     |
| A command that does not fit   | Written as code in the action; Treflex's refusals are for code that breaks its rules (a write outside the action) | A guard or a phase refuses it, says why, and the refusal is in the log and on `store.refused`                                                                                              |
| Surviving a reload            | State, timers and connections save to one JSON string; cut-off work is reported                                   | Durable stores replay their log on the device; a command recorded just before a reload is carried out by the next tab, or reported as abandoned; the outbox resends what was not confirmed |
| Removing the owner            | Removing an entity stops its work, timers and connections                                                         | A store beside a component closes with it; its reactions stop with its scope                                                                                                               |
| Seeing what happened          | A record stream and an activity log                                                                               | One timeline of commands, refusals, UI state and routes, each with its trace; time travel and forks in the devtools                                                                        |

## What each makes impossible

- **Treflex:** an entity changing under an action while that action waits (the hold), and work
  stopping because its view went away.
- **Spar:** a command that waits on another (there is no way to write one), state that changes
  outside a reducer, a busy flag nobody resets (busy is a phase the state machine leaves), and an
  older answer landing over a newer one (`Store.afterLatest`, queries numbering their requests).

## Where they differ in spirit

Treflex makes the action the unit: it holds its entity, runs step by step, and the runtime can
pause, cancel, record and restore it between steps. Spar makes the state the unit: every change is
one action that the reducer accepts or refuses at once, and async work is a reaction that reports
back as more actions. Treflex queues a second click behind the first; Spar answers it at once,
either by refusing it (with the reason shown) or by letting the state machine's current phase
decide what it means.
