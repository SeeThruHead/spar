# Spar beside Solid 2.0

Solid 2.0 came out on 16 Nov 2026. This page is read from the published package `solid-js` 2.0.3:
its `CHEATSHEET.md`, its `diagnostics.json` and its `skills/reactivity-diagnostics/SKILL.md`. No
Solid 2 app was written for it beyond the benchmark's table (`apps/bench-solid2`), so what
follows is what Solid says it does, not what was seen it do, except where the benchmark is named.

## Data that arrives later

|                                   | Solid 2.0                                                                                           | Spar                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Declaring it                      | Any computation that returns a promise: `createMemo(() => fetchUser(id()))`                         | A query class with Schemas, then `yield* TheQuery.ask(input)` in the component                 |
| Reading it before it is there     | The read is "not ready" and the nearest `<Loading>` shows its fallback                              | Nothing waits: the handle is there at once, and the view shows its `status`                    |
| One piece that needs another      | A computation reads the other's value, so it runs when that value is ready                          | The second query's input is made from the first one's value; it is `waiting` until then        |
| While the input changes           | `isPending(() => user())`, `latest(id)`, and `createDeferred` to keep the last value on screen      | `status` is `loading`; `latest` keeps the last loaded value                                    |
| A request that is superseded      | The earlier run is cleaned up, and an AbortController registered in it can cancel the request       | The earlier answer is refused when it lands (`SPAR_LATE_ANSWER`). The request is not cancelled |
| A cache by input, a stale time    | Not in the core: a computation holds the value for its current inputs                               | Yes: entries keyed by the encoded input, `staleAfter`, refetch on focus and reconnect          |
| A change shown before it is saved | `action` with `createOptimisticStore`; the optimistic value reverts by itself when the work settles | `patchedBy` with `Store.outbox`; the send survives a reload, and nothing reverts by itself     |
| Failure                           | `<Errored>`, or an effect's `error` option                                                          | The handle's `error`, typed by the query's failure Schema; `retry` takes a schedule            |
| Asking again                      | `refresh(user)`, with `affects(user)` to show it as pending                                         | The handle's `refetch`, `TheQuery.invalidate`, `invalidatedBy(action)`                         |

**The same idea in both.** Data that arrives later is a reactive value. What depends on it is
known from what reads it, so nobody lists dependencies or writes a loader beside the route, and
independent pieces load side by side.

**What Solid does better.**

- There is nothing to declare. An async value is a memo, and the old resource primitive is gone.
- A change in flight is a first-class thing: the screen holds what it showed, `isPending` says a
  change is on the way, and an optimistic value reverts by itself.
- A superseded request can be cancelled, not only ignored.
- It is small and fast. In this repo's benchmark the Solid 2 table ships 23.7 kB of JavaScript
  (gzip) against Spar's 69.2 kB, starts in 4.2 ms against 11.9 ms, and changes one row among
  10,000 in 0.5 ms against 1.6 ms (`docs/benchmarks.md`).
- Its run-time diagnostics go much further: 75 codes in `diagnostics.json` against Spar's 31,
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

|                        | Solid 2.0                                                                                                                                  | Spar                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When                   | While the app runs in a dev build, with attribution turned on                                                                              | At build time for a wait written in a component; while the app runs for the rest                                                                                              |
| What is reported       | `ASYNC_WATERFALL`: a chain of requests where each "provably could not start until the previous one resolved", with the time each link took | `SPAR_WAIT_IN_COMPONENT` (build): a `yield*` of a wait in a component's Effect. `SPAR_COMPONENT_WAITED` (log): a component that held its children back, with the milliseconds |
| On the server          | `SSR_BOUNDARY_WATERFALL`: a `<Loading>` boundary that needed three or more passes                                                          | Nothing reported. The server draws again until nothing is loading, and does not say how many times                                                                            |
| How sure it is         | Two links are reported as information, "leads, not verdicts"; three or more as a warning                                                   | The build rule is certain but narrow; the run-time note fires on time taken, 16 ms or more                                                                                    |
| A chain that is needed | Reported all the same, with advice to preload or join the requests on the server                                                           | Not reported as a problem. It is visible in the trace: the wait is drawn and the request names what its input came from                                                       |
| Known false finding    | Work a preloader or cache had already started; that layer marks its promises with `attribution.markFlight`                                 | None known for the build rule. The run-time note can fire on a slow machine                                                                                                   |

Where the waterfalls come from differs. In Solid a read of a value that is not ready stops the
scope there, so a second read below it does not start until the first has answered; its advice is
to "read ALL async sources before using any". In Spar `ask` returns at once, so two asks in one
component always start together, and the only way to make a waterfall is to wait in a component's
Effect, which is what the two Spar checks look for.

What Solid's check does that Spar's do not: it names the whole chain with the time of each link,
from the running app, without anyone opening a trace. Spar has the same facts in its trace but no
diagnostic that says "these three requests ran one after another". That would be one more code,
raised from the `spar.query.after` chain. It is not built.

What Spar's check does that Solid's does not, as far as the package shows: it stops the build
before the code runs.

## Errors written for agents

Solid 2 ships `diagnostics.json` (code, kind, severity, trigger, repair, guide address), prints a
report as `[CODE] message`, an `in` line with the owners, an `at` line with the file, line and
column, and points an agent at a skill file with a section for each code. Spar now does the same
in its own terms: `docs/diagnostics.md`. What Spar's reports lack next to Solid's: the path of
owning components on a run-time report, and a source location on anything but a build finding.
