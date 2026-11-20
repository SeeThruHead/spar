# Spar beside Solid 2.0

Solid 2.0 came out on 16 Nov 2026. This page is read from the published package `solid-js` 2.0.3:
its `CHEATSHEET.md`, its `diagnostics.json` and its `skills/reactivity-diagnostics/SKILL.md`. No
Solid 2 app was written for it beyond the benchmark's table (`apps/bench-solid2`), so what
follows is what Solid says it does, not what was seen it do, except where the benchmark is named.

## Data that arrives later

|                                   | Solid 2.0                                                                                           | Spar                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Declaring it                      | Any computation that returns a promise: `createMemo(() => fetchUser(id()))`                         | A query class with Schemas, then `yield* TheQuery.ask(input)` in the component                                                           |
| Reading it before it is there     | The read is "not ready" and the nearest `<Loading>` shows its fallback                              | Nothing waits: the handle is there at once, and the view shows its `status`                                                              |
| One piece that needs another      | A computation reads the other's value, so it runs when that value is ready                          | The second query's input is made from the first one's value; it is `waiting` until then                                                  |
| While the input changes           | `isPending(() => user())`, `latest(id)`, and `createDeferred` to keep the last value on screen      | `status` is `loading`; `latest` keeps the last loaded value                                                                              |
| A request that is superseded      | The earlier run is cleaned up, and an AbortController registered in it can cancel the request       | The earlier answer is refused when it lands (`SPAR_LATE_ANSWER`). The request is not cancelled                                           |
| A cache by input, a stale time    | Not in the core: a computation holds the value for its current inputs                               | Yes: entries keyed by the encoded input, `staleAfter`, refetch on focus and reconnect                                                    |
| A change shown before it is saved | `action` with `createOptimisticStore`; the optimistic value reverts by itself when the work settles | `patchedBy` with `Store.outbox`; the send survives a reload and is retried, and if it fails for good the query loads what the server has |
| Failure                           | `<Errored>`, or an effect's `error` option                                                          | The handle's `error`, typed by the query's failure Schema; `retry` takes a schedule                                                      |
| Asking again                      | `refresh(user)`, with `affects(user)` to show it as pending                                         | The handle's `refetch`, `TheQuery.invalidate`, `invalidatedBy(action)`                                                                   |

**The same idea in both.** Data that arrives later is a reactive value. What depends on it is
known from what reads it, so nobody lists dependencies or writes a loader beside the route, and
independent pieces load side by side.

**What Solid does better.**

- There is nothing to declare. An async value is a memo, and the old resource primitive is gone.
- A change in flight is a first-class thing: the screen holds what it showed, `isPending` says a
  change is on the way, and an optimistic value reverts by itself.
- A superseded request can be cancelled, not only ignored.
- It is small and quick to start. In this repo's benchmark the Solid 2 table ships 23.7 kB of
  JavaScript (gzip) against Spar's 70.0 kB, starts in 4.5 ms against 9.3 ms, and changes one row
  among 10,000 in 0.5 ms against 1.2 ms. Spar is ahead of it at updating, selecting, swapping and
  removing rows among 1,000 (`docs/benchmarks.md`).
- Its run-time diagnostics go much further: 75 codes in `diagnostics.json` against Spar's 34,
  among them slow scopes, effects that write their own source, and requests thrown away.

**What Spar adds.**

- Typed failure and typed requirements. A query's failure is a Schema and its services are in its
  type; a component cannot be mounted without the layers its queries need.
- A cache with a key and a stale time, in the framework.
- One log. Every request, answer and refusal is an action in the same log as every store command
  and UI state change, so the app can be rewound and forked with its server data.
- Traces without a collector: one navigation is one trace, with lenses and the wait of a
  dependent query drawn.
- Stores as state machines, where a command that does not apply is refused with a reason.
- An outbox that keeps what was sent across a reload and sends it again.

## Finding a waterfall

|                        | Solid 2.0                                                                                                                                  | Spar                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When                   | While the app runs in a dev build, with attribution turned on                                                                              | At compile time for a query with no input chained onto another; at build time for a wait written in a component; while the app runs for the rest                                                                                                                                      |
| What is reported       | `ASYNC_WATERFALL`: a chain of requests where each "provably could not start until the previous one resolved", with the time each link took | `SPAR_NEEDLESS_WAIT` (types): a query that takes no input given another query's value does not compile. `SPAR_WAIT_IN_COMPONENT` (build): a `yield*` of a wait in a component's Effect. `SPAR_COMPONENT_WAITED` (log): a component that held its children back, with the milliseconds |
| On the server          | `SSR_BOUNDARY_WATERFALL`: a `<Loading>` boundary that needed three or more passes                                                          | Nothing reported. The server draws again until nothing is loading, and does not say how many times                                                                                                                                                                                    |
| How sure it is         | Two links are reported as information, "leads, not verdicts"; three or more as a warning                                                   | The build rule is certain but narrow; the run-time note fires on time taken, 16 ms or more                                                                                                                                                                                            |
| A chain that is needed | Reported all the same, with advice to preload or join the requests on the server                                                           | Not reported as a problem. It is visible in the trace: the wait is drawn and the request names what its input came from                                                                                                                                                               |
| Known false finding    | Work a preloader or cache had already started; that layer marks its promises with `attribution.markFlight`                                 | None known for the build rule. The run-time note can fire on a slow machine                                                                                                                                                                                                           |

Where the waterfalls come from differs. In Solid a read of a value that is not ready stops the
scope there, so a second read below it does not start until the first has answered; its advice is
to "read ALL async sources before using any". In Spar `ask` returns at once, so two asks in one
component always start together, and the only way to make a waterfall is to wait in a component's
Effect, which is what the two Spar checks look for.

Spar now reports a chain too (`SPAR_QUERY_CHAIN`): three or more requests that each waited for
the one before, or two where the second had the same input as the first and so did not need its
answer. It is worked out from the spans of a trace, so it shows in the trace panel and comes
back from the agents' navigation tool. It says how long after the one before each request started. What Solid's check still does that
Spar's does not: it warns from the running app without anyone asking for a trace.

What Spar's check does that Solid's does not, as far as the package shows: it stops the build
before the code runs.

## Errors written for agents

Solid 2 ships `diagnostics.json` (code, kind, severity, trigger, repair, guide address), prints a
report as `[CODE] message`, an `in` line with the owners, an `at` line with the file, line and
column, and points an agent at a skill file with a section for each code. Spar now does the same
in its own terms: `docs/diagnostics.md`. A crashed part and a component that held its children back
are reported with the path of owning components and the file, line and column where the view was
made. What Spar's reports still lack next to Solid's: a location for anything finer than a view
(a binding, an effect), and an owner path on a store's refusal, which has no component.

## Routing and preloading

Read from the README of Solid Router's main branch, whose 1.0 line targets Solid 2.

|                                         | Solid Router 1.0                                                                                  | Spar                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Where a route's data is                 | A `query` function, read with a memo in the component, and started early by the route's `preload` | `ask` in the component; nothing is declared on the route                                    |
| Preload on intent                       | Opt-in for the router: after the pointer rests on a link for 20 ms, or on focus or touch          | Opt-in for each link: `onIntent` on the anchor                                              |
| What preloading runs                    | The target route's `preload` functions and lazy components                                        | A rehearsal that mounts the app at the target without drawing it, which reaches every `ask` |
| How long preloaded data counts as fresh | 5 seconds, so the preload and the route's own read share one fetch                                | The query's `staleAfter`, which is 0 unless set, so a preload can be wasted                 |
| Going back                              | A back and forward cache for up to 5 minutes                                                      | The query's cache, by `staleAfter`; scroll position is restored                             |
| After a mutation                        | `revalidate` by key; single flight returns the refreshed route data in the mutation's response    | `invalidatedBy(action)`, `patchedBy(action)`; the refetch is a second request               |

Two things Solid Router does that bear on Spar's list of open cases. Preloaded data is fresh for
a few seconds by itself, which is the behaviour the default stale time of 0 lacks. And a
mutation's answer brings the refreshed data with it, where Spar asks again.
