# Spar beside an Elm-architecture framework

Foldkit is moving under the Effect organization and its frontend is being rebuilt as Elm-inspired
primitives inside Effect. This page records, as plainly as possible, what differs between that
architecture and Spar's. Foldkit's side is read from the installed package (0.170.0) and from the
two apps in this repo that are written in it (`apps/bench/src/foldkit` and
`apps/bench/src/nav-foldkit`). Nothing is known here about the rebuilt version: as of 19 Nov
2026 there is no public code or RFC for it, in Foldkit's repo or under the Effect organization.

## What Spar does that the Elm architecture does not, by its structure

In the Elm architecture there is one Model, one `update`, and a view that is a function of the
Model. These follow from that shape, not from how well it is built:

- **State and server data beside the component that uses them.** A Spar component asks for its
  data in its own Effect (`TheQuery.ask(input)`), and a store can ship with a view
  (`Store.with`, `Query.beside`). In the Elm architecture a child's data is a field in the
  Model, a Message for its answer and a branch in `update`, wired in by each parent. In the
  five-segment navigation written in Foldkit, the click's branch of `update` lists the five
  lookups, and the branch that handles an answer starts the sixth
  (`apps/bench/src/nav-foldkit/main.ts`).
- **The natural prop-then-query style.** A parent passes a value down, the child makes a query
  from it, and the child's query waits for that value by itself, because a reactive value knows
  where it came from. In the Elm architecture "this depends on that" is code in `update`.
- **The dependency graph as data.** Because the dependency is known, it is recorded
  (`spar.query.after`), drawn in the waterfall and given to agents. In the Elm architecture it
  can be read only from the order Commands were returned in.
- **A view runs once.** Reactive values update single nodes. A view that is a function of the
  Model is run again and compared.
- **Component-local state that is not app state.** `UiState` holds what was typed or which menu
  is open without it being a field of the app's Model. It is still recorded and replayed.

Not structural, but built in Spar and absent from Foldkit 0.170.0's devtools protocol: a trace
viewer with lenses and no collector, forking from a past moment, and a waterfall across the page
and the backend (`docs/devtools-compared.md`).

## What Foldkit does better

- **One value holds everything.** The whole app's state is one Model with one Schema. Spar has
  several stores and UI state, joined by a log; no single value is the app.
- **Every Message is handled in one place,** one `update` with a match over the Messages. Spar
  does not check that every action has considered every state of a store.
- **Loading states are states.** `AsyncData` has `Refreshing(data)` and `Stale(error, data)`
  as cases of their own. In Spar you read `status` and `value` together.
- **Speed on a few list operations, depending on the run.** In the latest run of this repo's
  benchmark Foldkit is ahead of Spar only at removing a row. In earlier runs it was also ahead at
  swapping two rows and at changing one row among 10,000 timed to the next frame, so differences
  of a few milliseconds here are within the noise. Spar uses less memory and ships less
  JavaScript (`docs/benchmarks.md`).
- **Tools for testing a whole screen as data** (`foldkit/story`, `foldkit/scene`). Spar tests
  stores as services and components by role.
- **It will not be tied to the DOM.** The stated plan is primitives that work across rendering
  environments. Spar draws to the DOM and to an HTML string, nothing else.

## What Spar builds that Effect already ships or is likely to

Spar's internals are Effect services, layers, Schemas, RPC and spans. These parts are Spar's own,
and Effect 4.1.4 already has a module in the same territory, so they are where Spar would sit on
Effect's own pieces if its authoring model were kept:

| Spar's own                                   | In Effect today                                        |
| -------------------------------------------- | ------------------------------------------------------ |
| `Reactive` and the cell under it             | `effect/reactivity`: `Atom`, `AtomRef`, `AtomRegistry` |
| `Query`: status, cache, invalidation         | `AsyncResult`, `AtomRpc`, `Reactivity` (invalidation)  |
| The state sent with a server-drawn page      | `effect/reactivity` `Hydration`                        |
| A store's log of actions, kept on the device | `effect/eventlog`                                      |
| The outbox                                   | Nothing found that matches                             |
| The renderer, the router, the devtools       | Nothing today; the announced frontend primitives       |

Spar uses none of the modules in the right-hand column. Whether its model fits on them has not
been tried.
