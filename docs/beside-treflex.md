# Spar beside Treflex

Treflex is a runtime for front-end state and the work that runs on it (requests, timers, live
connections, multi-step flows), with Solid-style signals and bindings for React and Solid. This
page sets its model beside Spar's, from Treflex's own README and reference (`actions.md`,
`restart-and-records.md`). Both keep work out of components; they differ in where the work lives
and how two pieces of work on the same thing relate.

| Question                      | Treflex                                                                                                           | Spar                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Where work lives              | On an entity in the state tree (an object with an `$Id`); it runs while no view shows it                          | In a task of the store (`Store.task`): one Effect that changes the state once, when it finishes                |
| How state changes             | An action is a generator that writes the entity's draft directly                                                  | An action's reducer returns the next state; an Effect sends commands as its work goes                          |
| Reaching the outside world    | Yields declared effects; the runtime calls the implementation, or a stub in a test                                | Effect services in the Effect's requirements, provided as layers; a test provides other layers                 |
| Two actions on one entity     | Take turns: an action holds its entity until it finishes, so a second one waits                                   | A task names the commands refused while it runs; everything else applies at once                               |
| A repeat while the first runs | `leading` drops the repeat; `latest` stops the one running                                                        | The task's `mode`: `switch` stops the one running, `queue` waits, `concurrent` runs both; or it refuses itself |
| Is it running?                | `inFlight(action, owner)`                                                                                         | `store.running.<task>`, worked out from the task, not stored                                                   |
| A command that does not fit   | Written as code in the action; Treflex's refusals are for code that breaks its rules (a write outside the action) | Refused while a task that names it runs, and logged as `refused`                                               |
| Surviving a reload            | State, timers and connections save to one JSON string; cut-off work is reported                                   | A saved store (`layerSaved`) comes back from the device; an outbox channel resends what was not confirmed      |
| Removing the owner            | Removing an entity stops its work, timers and connections                                                         | A store beside a component closes with it; its fibers stop with its scope                                      |
| Seeing what happened          | A record stream and an activity log                                                                               | One timeline of commands, UI state and routes, each with its trace; time travel and forks in the devtools      |

## What each makes impossible

- **Treflex:** an entity changing under an action while that action waits (the hold), and work
  stopping because its view went away.
- **Spar:** state that changes outside a reducer, a half-finished task (it changes the state once,
  at its end, and has no finish command anyone could send early), a running flag that disagrees
  with what runs, and an older answer landing over a newer one (queries numbering their requests).

## Where they differ in spirit

Treflex makes the action the unit: it holds its entity, runs step by step, and the runtime can
pause, cancel, record and restore it between steps. Spar makes the state the unit: every change is
one command applied at once, and slow work is a task that changes the state once, when it ends.
Treflex queues a second click behind the first; in Spar the task says what a second click does
(`switch`, `queue` or `concurrent`) and which commands wait for nobody but are refused while it
runs. Both put the rule in one place, so it cannot be forgotten by a new command.
