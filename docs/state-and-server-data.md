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

## A store can be a state machine, or not

Both are the same thing, a `Store.Tag` with a Schema, actions and selectors. The difference is
whether some commands are wrong at some times.

**A plain store** accepts every command at any time. A list of notes, a set of collapsed
sections, a selection. Each action is a reducer and that is all.

**A state machine** has states in which some commands do not apply. Give the state a field that
names the state, and give each action that depends on it a guard. The guard is the third argument
of `Store.action` and answers with a reason, or null when the command is accepted:

```ts
incremented: Store.action(
  Schema.Void,
  (state: State): State => ({ ...state, count: state.count + 1 }),
  (state) => (state.phase === "resetting" ? "A reset is in progress" : null),
),
```

Use a state machine when there is a multi-step flow (start, wait, finish), when the server's
answer can arrive after the user has moved on, or when a command would corrupt something if it
ran at the wrong time. There is no state machine library and no chart: the states are a
`Schema.Literals` field and the transitions are the guards, in the same file as the reducers.

A refused command changes nothing and is not added to the store's log, so replaying the log gives
the same state. It is not silent either:

- it is an entry in the one log of everything that happened, kind `refused`, with the payload
  and the reason, so the devtools and an agent see it;
- its span in the trace carries `spar.refused` with the reason;
- the store's `refused` is the last refusal since the store last accepted a command, as a
  reactive value a view can show.

### Rules declared once

A guard belongs to one action. A rule belongs to the store. `invariants` name what no state may
be, and `transitions` name what no command may do, given the state before, the state after, the
action's name and its payload. They are checked after every command, whoever sent it. A command
that would break one is refused like any other refusal, and the reason names the rule:
`it would break the rule NothingChangesDuringAReset`.

```ts
export class CounterStore extends Store.Tag<CounterStore>()("Counter", {
  state: State,
  initialState,
  actions: { incremented, resetClicked, resetCompleted },
  selectors: { count, resetting },
  invariants: {
    CountIsNeverNegative: (state) => state.count >= 0,
  },
  transitions: {
    NothingChangesDuringAReset: ({ before, after, action }) =>
      before.phase !== "resetting" || action === "resetCompleted" || after === before,
  },
}) {}
```

With that one transition, no action of this counter needs a guard. Use a guard when the reason
should be a sentence for the user, and a rule for what must hold whatever is added later. Rules
are checked while the app runs; they are not proved.

(`packages/spar/test/rules.test.ts`)

### Commands declared for each state

A guard has to be remembered on every action, and one forgotten guard is a hole: a second
"reset" that starts the flow again, or a stray "reset completed" that ends it early. For a store
with states, say instead which commands each state accepts. Anything not listed is refused, by
name, with nothing to remember.

```ts
export class CounterStore extends Store.Tag<CounterStore>()("Counter", {
  state: State,
  initialState,
  actions: { incremented, resetClicked, resetCompleted },
  selectors: { count, resetting },
  phases: {
    of: (state) => state.phase,
    accepts: {
      idle: ["incremented", "resetClicked"],
      resetting: ["resetCompleted"],
    },
    internal: ["resetCompleted"],
  },
}) {}

export const resetAfterDelay = Store.during("resetting", (_state: State, send) =>
  Effect.andThen(
    Effect.sleep(Duration.seconds(2)),
    send(CounterStore.actions.resetCompleted, undefined),
  ),
)
```

- `accepts` lists the actions each state takes. A command sent in a state that does not list it
  is refused: `resetClicked: it is not accepted while resetting`.
- `internal` names actions only the store's own effects may send. From a view, a key or another
  store they are refused in every state, so a completion cannot arrive from outside.
- `Store.during(state, effect)` is an effect that belongs to a state: it starts when the store
  enters the state, including when the store opens already in it, and is interrupted when the
  store leaves. There is never a second timer, and nothing is left running after the state ends.

The action names are checked by the compiler. The state names are plain strings: a misspelt one
means nothing is accepted there.

(`packages/spar/test/phases.test.ts`)

## Four mistakes Spar reports while the app runs

A fifth used to be here: giving a query that takes no input a value from another query, so it
waited for nothing. That no longer compiles (`SPAR_NEEDLESS_WAIT`).

None of these can be refused by the compiler, because each is ordinary code that is wrong only in
how its timing works out. Spar notices them while the app runs, writes a warning in the agent
format (code, what, where, fix) and puts a `noticed` or `waited` entry in the log, which the
devtools and the agents' server show. Run the app, do the thing, and read the log.

| Code                   | What was done                                                                                    | Do this instead                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `SPAR_DUPLICATE_CALL`  | The same GET was made again through `Backend` while the first was still on its way               | One `Query.Tag`; every component that needs it asks for it. Never fetch in each row                        |
| `SPAR_OLDER_ANSWER`    | A `Store.after` run started by an earlier command answered after a later one's, on the same part | `Store.afterLatest`, or load it with a Query, which refuses an answer to an earlier request                |
| `SPAR_SENT_AGAIN`      | The same command with the same payload, while what the first one started was still running       | A guard on the action that refuses it while in progress, or `form.submit`, which ignores a second submit   |
| `SPAR_TYPING_REPLACED` | A field the user typed in was given a value by something that began before their last keystroke  | Keep the draft as its own state and the server's copy beside it. Never write an answer back into the draft |

Each has its own entry, with the full text, in the list of diagnostics.

## When events interleave

The problem, as Treflex's author put it about Elm-style frameworks: every message can arrive at
any point. A reset that takes two seconds is three steps (start, wait, finish). If "Add 1" arrives
during the wait, what happens? In the Foldkit demo the buttons are disabled while resetting, which
guards the buttons. A keyboard shortcut or a subscription that sends the same message is not
guarded by a disabled button.

|                              | Foldkit                                                                                                     | Treflex                                                                                                                                | Spar                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| The model                    | One Model; `update` takes a Message and returns the next Model and Commands                                 | Entities; an action is a generator dispatched on one entity                                                                            | Stores; an action is a reducer with an optional guard                                                         |
| A multi-step flow            | A field such as `isResetting`, a Command that sleeps, a Message when it completes                           | One generator: write, wait, write                                                                                                      | A state field such as `phase`, an after-effect that sleeps, a command when it completes                       |
| What arrives during the wait | Is handled at once by `update`. Whether it is safe is up to each branch of `update`, or to whoever sends it | Waits. The action holds its entity until it ends, so other work on it queues                                                           | Is handled at once by the store. The guard of that action decides: accepted, or refused with a reason         |
| Letting something in         | Nothing to do, everything gets in                                                                           | Mark the wait `open(...)`; the draft may not be touched during it and must be checked again after                                      | Nothing to do: an action without a guard is accepted in every state                                           |
| A repeat of the same action  | Handled like any other Message                                                                              | Queues, or is dropped when the action is marked `leading`                                                                              | Refused by its own guard ("A reset is already in progress")                                                   |
| Where the rule lives         | In `update` if written there; in the demo, in the view (disabled buttons)                                   | In the runtime: holding is the default                                                                                                 | In the store, beside the reducer. A button, a key and an agent all get the same answer                        |
| What a blocked sender sees   | Nothing, unless `update` records it                                                                         | The dispatch resolves later, or resolves `undefined` when dropped; a record of the dropped action                                      | A `refused` entry in the log with the reason, the same on the trace, and `store.refused` for the view         |
| Testing a race               | `foldkit/story` tests send Messages and answer Commands by hand                                             | Effects are answered by stubs whose promises the test resolves, so the order is chosen; `settled()` waits for everything that can move | `TestClock` and `Deferred` choose when async work answers; the test reads the state, the log and the refusals |

Said plainly: **Treflex makes holding the default, so nothing interleaves unless you open a
wait. Spar makes the states explicit, so everything interleaves and each action says in which
states it applies.** Foldkit can do what Spar does, by writing the same check in `update`; it
does not make you, and its own demo puts the check in the view.

What each costs:

- Treflex: you never forget a guard, because there is none to write. In exchange a held entity
  queues work the user cannot see waiting, long work has to be moved to a child entity so it does
  not hold the parent, and code after an open wait has to re-check what it read.
- Spar: nothing waits and nothing is hidden, and the rule is data in the model. In exchange you
  have to write the guard, and a store with many states has many guards. Spar does not check that
  every action has thought about every state.
- Foldkit: the least machinery. In exchange the rule is wherever you put it.

Spar deliberately has no holding or queueing primitive. A command that should wait for a flow to
finish is a command the store refuses and the user sends again, or a state the store moves to.

The counter that started the argument is in the showcase, `apps/sidebar/src/ResetCounter.ts`. Its
buttons are never disabled and the + key adds 1 too. The test that Add 1 during a reset is
refused and the reset still lands is `packages/spar/test/machine.test.ts`, on a clock the test
controls.

## Server data lives in a store

React Query plus props is two systems: a cache that components subscribe to, and the app's own
state, with server data carried between them through props and callbacks. In Spar there is one.
A query is a store, and declaring that a component needs one is a line in that component.

### The natural way works

A parent reads a value from a store and passes it to a child as a prop. The child declares a
query that uses the prop. That is all anybody writes:

```tsx
class OrdersQuery extends Query.Tag<OrdersQuery>()("shop/Orders", {
  input: Schema.Int,
  success: Schema.Array(Order),
  failure: ServerUnreachable,
  load: (userId) => Effect.flatMap(Effect.service(Server), (server) => server.orders(userId)),
  staleAfter: "30 seconds",
}) {}

const Orders = compose(
  withProps({ userId: Props.Reactive(Schema.Int) }),
  withQuery("orders", OrdersQuery, (props) => props.userId),
)((props) => (
  <p>
    {props.orders.status}: {Reactive.map(props.orders.value, (all) => all?.length ?? 0)} orders
  </p>
))

const Parent = compose(
  withStore(PeopleStore, (people) => ({ selected: people.select.selectedId })),
)((props) => <Orders userId={props.selected} />)
```

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

```ts
const users = yield * UsersQuery.ask()
const stock = yield * StockQuery.ask()
const first = Reactive.map(users.value, (loaded) => Option.fromNullishOr(loaded?.[0]?.id))
const orders = yield * OrdersQuery.ask(first)
```

Users and stock start together. Orders starts the moment users has answered, whether or not
stock has. The test that controls the order of the answers and checks exactly that is
`packages/spar/test/query.test.ts`.

The one line of the natural version that matters: the prop has to be passed as the reactive
value it is (`Props.Reactive`), not read out into a plain number first. A plain number works as
an input, but it cannot change and it does not know where it came from.

### What a query gives

Each of these is an entry in the log and a span in the trace.

| React Query                                | Spar                                                                                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useQuery` in a component                  | `yield* TheQuery.ask(input)` in the component's Effect                                                                                                                                            |
| `status`, `data`, `error`                  | The handle's `status` (`waiting`, `loading`, `loaded`, `failed`), `value`, `error`, `loading`                                                                                                     |
| Query keys                                 | The input, with a Schema. The cache is keyed by its encoded value                                                                                                                                 |
| `staleTime`                                | `staleAfter`                                                                                                                                                                                      |
| `refetch()`                                | The handle's `refetch`                                                                                                                                                                            |
| Deduping identical requests                | One request for each input at a time. A second while loading is refused, visibly                                                                                                                  |
| A late answer overwriting a newer one      | Refused: an answer carries the number of the request it answers                                                                                                                                   |
| `invalidateQueries` after a mutation       | `TheQuery.invalidatedBy(SomeStore.actions.saved)` in that store's reactions                                                                                                                       |
| Keeps old data while loading               | For the same input, yes: `value` stays while it is refetched. For a new input `value` is null until that input's answer arrives; show `latest` to keep the last rows on screen                    |
| `enabled: !!id` for a dependent query      | Pass a reactive `Option`: the query is `waiting` while it is none                                                                                                                                 |
| Optimistic update                          | `TheQuery.patchedBy(action, input, patch)` shows the change at once; `Store.outbox` on the same action sends it and ends with `TheQuery.invalidate`                                               |
| Refetch on focus and reconnect             | Yes, for what has gone stale, while a component is using the query                                                                                                                                |
| Keeping the last page while the next loads | The handle's `latest`                                                                                                                                                                             |
| Pagination and infinite lists              | `TheQuery.pages({ first, next })`: the pages loaded so far, whether there is more, and an action that loads the next                                                                              |
| Retries                                    | `retry`, a schedule; the status stays `loading` until it gives up                                                                                                                                 |
| Dropping unused data                       | An entry no component is using is released, and dropped after `dropAfter` (5 minutes unless set). Over `keepAtMost` entries (100 unless set), the longest unused go at once. Both show in the log |

### A list read a page at a time

A page is an input, so each page is its own entry in the cache. `pages` keeps the list of pages a
component has opened, as that component's UI state, and asks for each:

```tsx
const withFeed = Effect.fnUntraced(function* () {
  const feed = yield* PostsQuery.pages({
    first: { after: null },
    next: (page) => Option.map(Option.fromNullishOr(page.nextCursor), (after) => ({ after })),
  })

  return {
    posts: Reactive.map(feed.pages, (pages) => pages.flatMap((page) => page.posts)),
    loading: feed.loading,
    more: feed.more,
    onMore: feed.loadMore,
  }
})

const Feed = compose(withFeed)((props) => (
  <section aria-label="Posts">
    <ul>
      <For each={props.posts} by={(post) => post.id}>
        {(post) => <li>{Reactive.map(post, (now) => now.title)}</li>}
      </For>
    </ul>
    <button type="button" hidden={Reactive.map(props.more, (more) => !more)} onClick={props.onMore}>
      More
    </button>
  </section>
))
```

`next` is given a loaded page and its input and says what the following input is, or none at
the end. `loadMore` does nothing while the last page is still loading or when there is no more.
`failed` says a page failed. Going back to the list later finds its pages in the cache, by each
page's `staleAfter`. For numbered pages where only one shows at a time, pass the page number as
the input of an ordinary `ask` and show `latest` while the next one loads.

Place it like any store: `TheQuery.live` in the app's layers, or `TheQuery.beside(component)` to
ship it with the view that shows it.

### Another store's action reads it directly

Because the data is in a store, nothing has to carry it. In the showcase the people table loads,
rows are selected, and "Export CSV" is one command with no arguments:

```ts
export const exportsCsv = Store.after(
  PeopleStore.actions.exportRequested,
  Effect.fnUntraced(function* (_payload, state: State, send) {
    const loaded = yield* UsersQuery.read()

    yield* send(PeopleStore.actions.exported, csvOf(loaded ?? [], state.selected))
  }),
)
```

The view calls `people.commands.exportRequested()`. The store takes the selection from its own
state and the emails from the users query. No prop carries a user, and the view never sees an
email it does not draw. The request and the result are one trace
(`apps/sidebar/src/People.ts`, `apps/sidebar/test/people.test.ts`).

A reducer stays pure, so reading another store happens in the action's after-effect, which then
reports back with a command. That is the general shape for all async work in a store: a command
records the intent, an effect does the work, a command records the result.

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
| Asking for data         | `loadIfMissing`, `revalidate`, `revalidateOrLoad` return the next Model and a Command from `update`                | `ask(input)` in the component that needs it; `invalidatedBy` ties it to another store    |
| A late answer           | A generation number on each fetch                                                                                  | A request number on each answer, refused when it is not the current one                  |
| Stale time              | Not in the query's config as shipped: revalidation is asked for                                                    | `staleAfter`                                                                             |
| Keyed by arguments      | Yes (`KeyedQuery`)                                                                                                 | Yes: the input                                                                           |
| A dependent query       | The `update` branch that handles the first answer starts the second                                                | The second query's input is made from the first one's value; it waits by itself          |
| Reading it elsewhere    | Any `update` branch has the whole Model, so it reads the query's data directly                                     | An action's after-effect calls `TheQuery.read(input)`                                    |

Where Foldkit is ahead: `AsyncData` tells "refreshing with old data" and "failed but still
holding old data" apart as states of their own, where Spar leaves you to read `status` and
`value` together. Its query API is marked experimental. Where Spar is ahead: nothing is lifted or
folded by hand, a stale time is declared, a dependent query needs no code, and a refused request
or a late answer is visible in the log.
