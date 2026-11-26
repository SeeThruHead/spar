# Spar beside Effect UI

Effect UI (`@effect/ui`, github.com/Effect-TS/ui) is the Effect organization's new frontend
library, grown from Foldkit. This page is read from its source at commit 6f86af8 (26 Nov 2026),
which is not on npm yet. Both apps on this page are in this repo, type-checked and run:
`apps/bench/src/effect-ui` builds against that commit's snapshot.

## The same app in both

The reset counter: Add 1 counts, and Reset waits two seconds, then sets the count to 0. While the
reset runs, Add 1 and a second Reset do nothing.

Spar. The store holds the count, the reset is a task of the store, and the task names what it
refuses while it runs. The component takes what it needs from the store:

<<< packages/spar/test/besideEffectUi.test.tsx#CounterStore

<<< packages/spar/test/besideEffectUi.test.tsx#ResetCounter

Effect UI. The component is its own Elm program: a Model with a Schema, a message for each thing
that can happen, and `update` returning the next Model and the Commands to run. The wait is a
Command whose answer is the `CompletedReset` message:

<<< apps/bench/src/effect-ui/ResetCounter.ts#CounterMessage

<<< apps/bench/src/effect-ui/ResetCounter.ts#ResetAfterDelay

<<< apps/bench/src/effect-ui/ResetCounter.ts#CounterWithoutLayer

What the two have to say to make "nothing while it resets" true:

- **Spar** writes it once: `refuses: ["added", "reset"]` on the task. No action checks anything, a
  new action is not refused until it is listed, and a refused command is in the log as
  `refused`. Whether it runs is `store.running.reset`, worked out from the task.
- **Effect UI** writes it in each `update` branch: the Model has a `resetting` field, and
  `ClickedAdd` and `ClickedReset` each check it. A new message has to remember to. The
  completion is a message of the component like any other: a parent cannot send it (a parent
  only passes props), but `CompletedReset` handled while idle still sets the count to 0, and the
  devtools' `dispatch` tool can send it. `h.isRunning(ResetAfterDelay)` says whether the Command
  runs, and it is there in `view` only, not in `update`.

The table app of `docs/benchmarks.md` is also written in both (`apps/bench/src/spar`,
`apps/bench/src/effect-ui/main.ts`); there, Effect UI keeps each row with `h.lazy`, as its own
docs show.

## The log

- **Effect UI's `MessageLog` is off unless provided.** It defaults to a no-op, and the runtime
  builds no entry while it is off (`packages/ui/src/internal/messageLog.ts:11-19`,
  `internal/recorder.ts:117`). It is a development and test hook; production observability goes
  through Effect's tracer, logger and metrics (`MessageLog.ts:5-10`). Spar's log is always on,
  because a store changes only through it.
- **Both order one app's entries in one sequence.** Effect UI numbers every entry of one mounted
  root from one counter, across all its components (`internal/recorder.ts:37-42`,
  `internal/runtime.ts:519-521`), and records what caused each (`causedBy`). Spar has one
  timeline for the app: stores, UI state, routes and calls.
- **Replay.** Effect UI's `Story.fromLog` replays one component's path, purely, giving each
  `update` back the props, query results and shared values it read as recorded, and comparing the
  Commands it returns instead of running them (`testing/Story.ts:492-514`). The devtools' time
  travel paints the whole page from each instance's recorded state. Spar replays a store's
  entries to rebuild its state, rewinds the whole app's state to a moment, and forks from it.

## Where Effect UI is stronger

- **A larger component kit.** At 87a704b, `@effect/ui-kit` exports 44 unstyled components
  (among them Accordion, Calendar, Combobox, DatePicker, Drawer, NumberField, Slider and
  VirtualList) and 4 helper modules (ListNavigation, Positioning, Typeahead, VirtualKeyboard).
  Spar's kit, `@spar/ui`, has 13: Button, SubmitButton, TextField, Checkbox, Switch, Select,
  Listbox, Menu, Tabs, Dialog, Popover, Tooltip and Toast.
- **Testing a screen as data.** `Story` sends messages and resolves Commands by hand, and
  `HtmlScene` clicks by role, both with no browser and no clock. Spar tests stores as services
  and components by role in a page.
- **Every message of a component in one place,** `update` keyed by message tag: leave one out
  and it does not compile.
- **The causal chain in the devtools:** each entry links to what sent it and to where each
  Command it issued ended, and why.
- **Breadth for its age:** SSR with hydration, a router, `Component.lazy` for code splitting,
  keep-alive children, debounced and many-at-once queries, and a terminal host on OpenTUI.
- **It is Effect's own,** and is likely to be what an Effect user reaches for first.

## Where Spar is stronger

- **A rule written once cannot be forgotten.** `refuses` on a task, and the build refusing
  mistakes it can see (the `SPAR_` codes, each with its fix). Effect UI's
  guards are code in each `update` branch.
- **A view runs once.** Reactive values update the nodes that show them; Effect UI renders the
  instance again and patches what changed (with `h.lazy` to skip unchanged rows).
- **Traces.** Every command, task, query and call is an Effect span, drawn as a waterfall in the
  devtools with no collector. Effect UI's core has no spans at 6f86af8; its log is the record.
- **The log is the state.** Always on, replayed to rebuild state, rewound and forked, and kept on
  the device for a saved store; an outbox resends what the server has not confirmed.
- **Data where it is used.** A component asks for a query in its own Effect, and a reactive input
  makes a dependent query wait by itself. In Effect UI a component declares its queries by name
  with their args, which is close; a query's result stays beside the Model in both.

## Speed and size

Both are in `docs/benchmarks.md`, measured on the same CI box as the others. In the run at
7ce3181, Spar was ahead of Effect UI at selecting a row (3.1 ms against 3.9), updating every
10th row (18.6 against 29.0) and changing one row among 10,000 until the DOM changed (2.4 against
15.7). Effect UI was ahead at clearing 1,000 rows (10.4 against 14.7), swapping two rows (17.8
against 24.2) and starting up (38.8 against 45.1). Creating, replacing and removing rows, changing
one row among 10,000 to the next frame, and memory were close. The table app ships 56.1 kB
gzipped in Spar and 59.1 kB in Effect UI. That run was slower than usual for every framework on
the box, and several milliseconds move between runs, so read the ratios, not single cells.

What is left in clearing, profiled on the box with `bun run --cwd apps/bench profile`: removing
the rows takes Spar about as long as Effect UI, since the DOM is the same and both take it out in
one call. The rest is that each Spar row owns its listeners and subscriptions and lets them go,
where Effect UI's rows hold no listeners (it listens once, on the root). Startup is spread over
module evaluation and setting up the runtime, layers and store, with no step much bigger than
the others.
