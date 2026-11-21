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

A store is a Schema, pure actions and selectors over its part of the one state. It accepts every
command at any time; there are no guards, phases or refusals. Work that takes time is a plain
Effect on a service, and Effect's own tools decide what happens when events interleave.

A reset that takes two seconds is three steps: start, wait, finish. Written as one Effect and run
by a `FiberHandle` with `onlyIfMissing`, a second press while it runs does nothing, from a button,
a key or an agent alike:

<<< apps/site/src/StoreDemo.ts#withReset

The same tools cover the other cases:

| What should happen to a repeat | How it is written                                                   |
| ------------------------------ | ------------------------------------------------------------------- |
| Ignored while the first runs   | `FiberHandle.run(handle, effect, { onlyIfMissing: true })`          |
| Replaces the first             | `FiberHandle.run(handle, effect)`, which interrupts the earlier run |
| Waits its turn                 | A `Semaphore` with one permit around the effect                     |
| One per key                    | A `FiberMap` keyed by what the work is about                        |
| Survives a reload and retries  | An `Outbox.channel`, which keeps it on the device until it is sent  |

Every command is in the log and the trace with what it carried, so the order things happened in
is never a guess. The counter in the showcase, `apps/sidebar/src/ResetCounter.tsx`, keeps its
buttons enabled and its + key working; its reset is the Effect above.

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

- **`ask` is a declaration.** It returns at once with a handle of reactive values (`status`,
  `value`, `error`, `loading`) and `refetch`. It does not wait for data, and no enhancer
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
| `status`, `data`, `error`                  | The handle's `status` (`waiting`, `loading`, `loaded`, `failed`), `value`, `error`, `loading`                                                                                                               |
| Query keys                                 | The input, with a Schema. The cache is keyed by its encoded value                                                                                                                                           |
| `staleTime`                                | `staleAfter`                                                                                                                                                                                                |
| `refetch()`                                | The handle's `refetch`                                                                                                                                                                                      |
| Deduping identical requests                | One request for each input at a time. A second while loading is not sent                                                                                                                                    |
| A late answer overwriting a newer one      | Ignored: an answer carries the number of the request it answers                                                                                                                                             |
| `invalidateQueries` after a mutation       | `TheQuery.invalidate` after the save, in the service method that saves                                                                                                                                      |
| Keeps old data while loading               | For the same input, yes: `value` stays while it is refetched. For a new input `value` is null until that input's answer arrives; show `latest` to keep the last rows on screen                              |
| `enabled: !!id` for a dependent query      | Pass a reactive `Option`: the query is `waiting` while it is none                                                                                                                                           |
| Optimistic update                          | `TheQuery.patch(input, change)` shows the change at once; an `Outbox.channel` sends it and ends with `TheQuery.invalidate`; `Outbox.givenUp(channel)` runs `TheQuery.invalidate` if the send fails for good |
| Refetch on focus and reconnect             | Yes, for what has gone stale, while a component is using the query                                                                                                                                          |
| Keeping the last page while the next loads | The handle's `latest`                                                                                                                                                                                       |
| Pagination and infinite lists              | `TheQuery.pages({ first, next })`: the pages loaded so far, whether there is more, and an action that loads the next                                                                                        |
| Retries                                    | `retry`, a schedule; the status stays `loading` until it gives up                                                                                                                                           |
| Dropping unused data                       | An entry no component is using is released, and dropped after `dropAfter` (5 minutes unless set). Over `keepAtMost` entries (100 unless set), the longest unused go at once. Both show in the log           |

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
the input of an ordinary `ask` and show `latest` while the next one loads.

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

Where Foldkit is ahead: `AsyncData` tells "refreshing with old data" and "failed but still
holding old data" apart as states of their own, where Spar leaves you to read `status` and
`value` together. Its query API is marked experimental. Where Spar is ahead: nothing is lifted or
folded by hand, a stale time is declared, a dependent query needs no code, and every request and
answer is in the log.
