# Spar beside Treflex

Treflex is a runtime for front-end state and the work that runs on it (requests, timers, live
connections, multi-step flows), with Solid-style signals and bindings for React and Solid. This
page sets its model beside Spar's, from Treflex's own README and reference (`actions.md`,
`restart-and-records.md`). Both keep work out of components; they differ in where the work lives
and how two pieces of work on the same thing relate.

| Question                      | Treflex                                                                                                           | Spar                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Where work lives              | On an entity in the state tree (an object with an `$Id`); it runs while no view shows it                          | In an Effect on a service; the store (`Store.Tag`) holds the state, a reducer per action                  |
| How state changes             | An action is a generator that writes the entity's draft directly                                                  | An action's reducer returns the next state; an Effect sends commands as its work goes                     |
| Reaching the outside world    | Yields declared effects; the runtime calls the implementation, or a stub in a test                                | Effect services in the Effect's requirements, provided as layers; a test provides other layers            |
| Two actions on one entity     | Take turns: an action holds its entity until it finishes, so a second one waits                                   | Never wait for each other unless the Effect says so (a `Semaphore`); each command applies at once         |
| A repeat while the first runs | `leading` drops the repeat; `latest` stops the one running                                                        | `FiberHandle.run` with `onlyIfMissing` ignores the repeat; plain `FiberHandle.run` stops the one running  |
| Is it running?                | `inFlight(action, owner)`                                                                                         | A field in the state that the Effect sets at its start and end, so the view can read it                   |
| A command that does not fit   | Written as code in the action; Treflex's refusals are for code that breaks its rules (a write outside the action) | Written as code in the Effect, before it sends the command                                                |
| Surviving a reload            | State, timers and connections save to one JSON string; cut-off work is reported                                   | A saved store (`layerSaved`) comes back from the device; an outbox channel resends what was not confirmed |
| Removing the owner            | Removing an entity stops its work, timers and connections                                                         | A store beside a component closes with it; its fibers stop with its scope                                 |
| Seeing what happened          | A record stream and an activity log                                                                               | One timeline of commands, UI state and routes, each with its trace; time travel and forks in the devtools |

## What each makes impossible

- **Treflex:** an entity changing under an action while that action waits (the hold), and work
  stopping because its view went away.
- **Spar:** state that changes outside a reducer, work that runs twice (one Effect in a
  `FiberHandle` ignores or replaces a repeat), and an older answer landing over a newer one
  (queries numbering their requests).

## Where they differ in spirit

Treflex makes the action the unit: it holds its entity, runs step by step, and the runtime can
pause, cancel, record and restore it between steps. Spar makes the state the unit: every change is
one command applied at once, and async work is a plain Effect that sends commands as it goes.
Treflex queues a second click behind the first; in Spar the Effect says what a second click does,
with Effect's own tools: a `FiberHandle` that ignores it or replaces the first run, or a
`Semaphore` that queues it.
