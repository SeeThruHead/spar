# State, events that interleave, and server data

Three questions come up in every app with async work: where does a piece of state live, what
happens when two things arrive at once, and where does server data go. Spar gives one answer to
each. This page says what the answers are and sets them beside Foldkit's and Treflex's.

## UI state or store state

Ask who would miss it.

- **UI state** is what only the screen would miss: a dropdown is open, which tab is showing, what
  has been typed and not yet sent, where a divider was dragged to. It is made with
  `UiState.make(name, Schema, initial)` in the component's Effect, it belongs to that one
  component, and it is gone when the component unmounts. It never goes in a store. A store that
  knows a dropdown is open is a store that has to be told every time a dropdown opens.
- **Store state** is what the app would miss: the people, the selection that an export will use,
  whether a reset is in progress, what the server last said. It lives in a store, it changes only
  through named commands, and every command is in the log.

A test for the edge cases: if another part of the app, a keyboard shortcut, or an agent would
ever need to read it or change it, it is store state. The selection in the people table is store
state because "Export CSV" reads it. The text in a search box is UI state until something else
needs it.

## What takes time is an Effect

A store is a Schema, pure actions and selectors over its part of the one state. Work that takes
time is a task of the store: an Effect that runs in the store, then changes the state once, when
it finishes. A task says what happens when it is started again, and which commands the store
refuses while it runs.

The counter's reset waits two seconds, then sets the count to 0. While it runs, Add 1 and a second
reset are refused, from a button, a key or an agent alike:

<<< apps/sidebar/src/ResetCounterStore.ts#ResetCounterStore

What this rules out:

- **No half-finished reset.** The reset is one task, not a start command and a finish command, so
  nothing can interleave between two steps, and nobody can send the finish early: there is no
  finish command to send.
- **No flag to forget.** `store.running.reset` is true while the task runs. It is worked out from
  the task, not stored in the state, so it cannot disagree with what is running.
- **No check to repeat.** What the reset refuses is written once, on the task. An action does not
  check anything, so a new action cannot forget to.

### The trap: a phase that nothing ends

The way to write this without a task is a `phase` field: a `resetClicked` command sets it to
`"resetting"`, and an Effect somewhere waits and then sends `resetCompleted` to set it back. It
looks the same in a demo. It is not the same:

- **Nothing owns the end.** The phase is state, but the work that should end it is not. If that
  Effect fails, is interrupted, or was never started (the component that ran it unmounted, a test
  sent only the first command, a reload brought the phase back from storage), the store stays
  `"resetting"` for good, and nothing in it says why.
- **Anyone can end it.** `resetCompleted` is a command like any other, so a button, an agent or a
  stray replay can send it early, halfway through the wait.
- **Every command has to check.** The phase is a lock only if each action looks at it. Add an
  action and forget the check, and it runs in the middle of the reset.
- **A second start starts it again.** `resetClicked` during `"resetting"` starts a second timer
  unless someone wrote a check for that too.

Running work is not state. A task holds the work and the "is it running" together: the phase
cannot outlive the fiber, there is no finish command to send, `refuses` is the one check, and
`mode` says what a second start does. When you find a field that says work is under way, make
the work a task and read `store.running.<task>` instead.

A refused command changes nothing. It shows in the log and the devtools as `refused`, with the
task it met. The task's start and its finish are in the log with what they carried, so a log
replays to the same state. When one run of a task refuses commands three times, Spar also notes
`SPAR_REFUSALS_PILED_UP` against that task (once per run): the screen kept offering something
the store would not do, so disable it while `store.running.<task>` is true.

| `mode`         | What happens when it is started again while it runs              |
| -------------- | ---------------------------------------------------------------- |
| `"switch"`     | The new run replaces the running one, which is interrupted       |
| `"queue"`      | The new run waits for the one before it                          |
| `"concurrent"` | Both run                                                         |
| any mode       | List the task in its own `refuses` and a second start is refused |

Work that must survive a reload and be retried, such as a message to the server, goes through an
`Outbox.channel` instead, which keeps it on the device until it is sent.

## Server data lives in a store

React Query plus props is two systems: a cache that components subscribe to, and the app's own
state, with server data carried between them through props and callbacks. In Spar there is one.
A query is a store, and declaring that a component needs one is a line in that component.

### The natural way works

A parent reads a value from a store and passes it to a child as a prop. The child declares a
query that uses the prop. That is all anybody writes:

<<< packages/spar/test/serverData.test.tsx#OrdersQuery

<<< packages/spar/test/serverData.test.tsx#Orders

<<< packages/spar/test/serverData.test.tsx#Parent

That file mounts `Parent` and checks it shows `loaded: 3 orders`.

There is no loader in another file, no fragment, no compile step and no list of dependencies.
What makes that enough:

- **`ask` is a declaration.** It returns at once with a handle: `result`, a reactive Effect
  `AsyncResult` (`Initial`, `Success` or `Failure`, each with a `waiting` flag), and `refetch`.
  It does not wait for data, and no enhancer
  does, so every query in the tree being mounted is declared in the same
  pass and they all start together. Nesting components does not make a waterfall.
- **The query runs in its store, not in the component.** The store is provided at the root
  (`OrdersQuery.live`), so the request and its result outlive the component that asked, and two
  components that ask for the same input share one request.
- **The input is a value that changes.** `ask` takes a plain value, a reactive value, or a
  reactive `Option`. When it changes, the query for the new input starts; going back to an input
  that is still fresh is a cache hit.
- **A real dependency is an input that is not there yet.** Give `ask` a reactive `Option` made
  from another query's value and it is `waiting` until that value arrives, then starts at once.
  That is the only waterfall there is, and it is visible as a state.

<<< packages/spar/test/query.test.ts#askedTogether

Users and stock start together. Orders starts the moment users has answered, whether or not
stock has. The test in that file runs exactly this, controls the order of the answers, and checks
it.

The one line of the natural version that matters: the prop has to be passed as the reactive
value it is (`Props.Reactive`), not read out into a plain number first. A plain number works as
an input, but it cannot change and it does not know where it came from.

### What a query gives

Each of these is an entry in the log and a span in the trace.

| React Query                                | Spar                                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useQuery` in a component                  | `yield* TheQuery.ask(input)` in the component's Effect                                                                                                                                                      |
| `status`, `data`, `error`                  | The handle's `result`, an `AsyncResult` from `effect/reactivity`: read it with `AsyncResult.match`, `AsyncResult.value` or `result.waiting`                                                                 |
| Query keys                                 | The input, with a Schema. The cache is keyed by its encoded value                                                                                                                                           |
| `staleTime`                                | `staleAfter`                                                                                                                                                                                                |
| `refetch()`                                | The handle's `refetch`                                                                                                                                                                                      |
| Deduping identical requests                | One request for each input at a time. A second while loading is not sent                                                                                                                                    |
| A late answer overwriting a newer one      | Ignored: an answer carries the number of the request it answers                                                                                                                                             |
| `invalidateQueries` after a mutation       | `TheQuery.invalidate` after the save, in the service method that saves                                                                                                                                      |
| Keeps old data while loading               | Yes: while a refetch or a new input loads, `result` is the last `Success` with `waiting: true`, so the last rows stay on screen and `waiting` says they are being replaced                                  |
| `enabled: !!id` for a dependent query      | Pass a reactive `Option`: the query is `waiting` while it is none                                                                                                                                           |
| Optimistic update                          | `TheQuery.patch(input, change)` shows the change at once; an `Outbox.channel` sends it and ends with `TheQuery.invalidate`; `Outbox.givenUp(channel)` runs `TheQuery.invalidate` if the send fails for good |
| Refetch on focus and reconnect             | Yes, for what has gone stale, while a component is using the query                                                                                                                                          |
| Keeping the last page while the next loads | Nothing to do: `result` keeps the last page, marked `waiting`                                                                                                                                               |
| Pagination and infinite lists              | `TheQuery.pages({ first, next })`: the pages loaded so far, whether there is more, and an action that loads the next                                                                                        |
| Retries                                    | `retry`, a schedule; `result` stays `waiting` until it gives up                                                                                                                                             |
| Dropping unused data                       | An entry no component is using is released, and dropped after `dropAfter` (5 minutes unless set). Over `keepAtMost` entries (100 unless set), the longest unused go at once. Both show in the log           |
| `refetchInterval`                          | `refetchEvery: "10 seconds"`: one timer for each input while any component uses it, none while the page is hidden. A bare number is a type error, since it would read as milliseconds                       |
| Debouncing a typed input                   | `debounce: "300 millis"`: the first input is asked at once, a changed one only once it has stayed put that long, and `result` keeps the last answer meanwhile                                               |

### A list read a page at a time

A page is an input, so each page is its own entry in the cache. `pages` keeps the list of pages a
component has opened, as that component's UI state, and asks for each:

<<< packages/spar/test/serverData.test.tsx#withFeed

<<< packages/spar/test/serverData.test.tsx#Feed

The same file mounts `Feed`, presses More, sees the second page, and checks that More goes away
at the end.

`next` is given a loaded page and its input and says what the following input is, or none at
the end. `loadMore` does nothing while the last page is still loading or when there is no more.
`failed` says a page failed. Going back to the list later finds its pages in the cache, by each
page's `staleAfter`. For numbered pages where only one shows at a time, pass the page number as
the input of an ordinary `ask`: its `result` keeps the page on screen, marked `waiting`, while the
next one loads.

Place it like any store: `TheQuery.live` in the app's layers, or `TheQuery.beside(component)` to
ship it with the view that shows it.

### Another store's action reads it directly

Because the data is in a store, nothing has to carry it. In the showcase the people table loads,
rows are selected, and "Export CSV" is one Effect with no arguments:

<<< apps/sidebar/src/People.ts#exportCsv

It takes the selection from the store and the emails from the users query. No prop carries a
user, and the view never sees an email it does not draw. The click and the result are one trace
(`apps/sidebar/src/People.ts`, `apps/sidebar/test/people.test.ts`).

A reducer stays pure, so reading another store happens in an Effect, which then records the
result with a command. That is the general shape for all async work: an Effect does the work, a
command records what came of it.

### Beside Foldkit

Foldkit's side is read from the installed package (0.170.0): `foldkit/asyncData` and the
experimental `foldkit/experimental/query`, which its "API Cache Query" example is built on. Its
plain "API Cache" example does the same by hand with `AsyncData` fields in the Model.

|                         | Foldkit                                                                                                            | Spar                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Where server data lives | In the one Model, as a Query submodel holding an `AsyncData` value                                                 | In a query store                                                                         |
| Declaring one           | `Query.define({ name, data, error, execute })`, with `args` for a keyed one                                        | `Query.Tag<Self>()(key, { input, success, failure, load, staleAfter })`                  |
| States                  | `AsyncData`: `Idle`, `Loading`, `Refreshing(data)`, `Failure(error)`, `Stale(error, data)`, `Success(data)`        | `status` of `waiting`, `loading`, `loaded`, `failed`, with `value` and `error` beside it |
| Wiring it in            | The parent adds the submodel to its Model, lifts the query's update into its own, and folds the completion Message | Provide the layer, or use `.beside(component)`. Nothing is folded by hand                |
| Asking for data         | `loadIfMissing`, `revalidate`, `revalidateOrLoad` return the next Model and a Command from `update`                | `ask(input)` in the component that needs it; `invalidate` after a save                   |
| A late answer           | A generation number on each fetch                                                                                  | A request number on each answer, ignored when it is not the current one                  |
| Stale time              | Not in the query's config as shipped: revalidation is asked for                                                    | `staleAfter`                                                                             |
| Keyed by arguments      | Yes (`KeyedQuery`)                                                                                                 | Yes: the input                                                                           |
| A dependent query       | The `update` branch that handles the first answer starts the second                                                | The second query's input is made from the first one's value; it waits by itself          |
| Reading it elsewhere    | Any `update` branch has the whole Model, so it reads the query's data directly                                     | An Effect calls `TheQuery.read(input)`                                                   |

Both tell "refreshing with old data" and "failed but still holding old data" apart: Foldkit with
`AsyncData`'s `Refreshing` and `Stale`, Spar with Effect's `AsyncResult` (a `Success` or a
`Failure` with `waiting`, and a `Failure` that keeps its `previousSuccess`). Foldkit's query API
is marked experimental. Where Spar is ahead: nothing is lifted or
folded by hand, a stale time is declared, a dependent query needs no code, and every request and
answer is in the log.
