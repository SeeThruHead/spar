# Diagnostics

Every error and lint finding Spar reports has a code that does not change. A report is
the code and what happened, where it happened when that is known, the fix, and a pointer to its
section here:

```
[SPAR_WAIT_IN_COMPONENT] A component's Effect does not wait. Whatever it waits for holds back every component below it, and their queries start late: a waterfall.
  at src/AgentPage.ts:41:23
  fix: Declare the data with a Query and ask for it (yield* TheQuery.ask(input)); the handle is there at once and the view shows its status.
  see: LLMS.md, section "SPAR_WAIT_IN_COMPONENT"
```

A report from the running app about a component also has an `in` line, the components it is
inside from the root down, and its `at` line is where that component's view was made:

```
[SPAR_PART_CRASHED] A part of the page crashed.
  in ShellView > PeopleView
  at /src/PeopleView.tsx:12:27
  fix: Read the defect that follows. If the part is wrapped in View.crash the rest of the page kept working; fix the cause in the component the report names.
  see: LLMS.md, section "SPAR_PART_CRASHED"
```

The same list is in `packages/spar/diagnostics.json` for tools.

### SPAR_JSX_OUTSIDE_VIEW

JSX can only be the body of a view. Inside an expression or a call it becomes template control flow.

Fix: Give it its own view, and use Reactive.when or Reactive.mapBy in the component's Effect.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_VIEW_WITHOUT_SCHEMA

A plain function that returns JSX has no Schema for its props.

Fix: Make the view with View.make(name, props, draw), where props gives a Schema for each prop.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_EFFECT_RUN_IN_VIEW

A view cannot run an Effect.

Fix: Do the work in one of the component's enhancers and pass the result in as a prop.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_STATE_OUTSIDE_STORE

A Ref, a SubscriptionRef or a variable that is assigned again is state the log cannot see.

Fix: Hold state in a Store (Store.Tag, placed with .layer or beside a view with .with) or in UiState.make, so every change is an action in the one log the devtools read.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_ENHANCER_UNTYPED

An enhancer whose props parameter has no type: written inline as a function before more enhancers, or made with withEffectProps, withHandlers or withEffect outside compose. Inside compose TypeScript works such a function out last, and outside compose nothing tells it the props, so its props, and those of every enhancer after it, are unknown.

Fix: Inside compose, wrap it: withEffectProps((props) => effect) for props made by an Effect, withHandlers((props) => values) for plain values. Outside compose, give its parameter a type: withEffectProps(Effect.fnUntraced(function* (props: { readonly filter: Reactive.Reactive<Filter> }) { ... })), or write it inline in compose.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_FIRST_ENHANCER_PROPSLESS

compose starts with an enhancer that takes no props, followed by more enhancers. Nothing then tells TypeScript the props, so every enhancer after it sees them as unknown ('props' is of type 'unknown', TS18046).

Fix: Start compose with withProps(...), withProps({}) when the component takes no props, and put the enhancer after it.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_CHILD_NEEDS_A_SERVICE

A component drawn inside another needs a service that nothing above it provides: not the layer given to App.mount, and not a store beside a component it is drawn in. TypeScript cannot see this through JSX, so the build checks it.

Fix: Add the service's layer to the layer given to App.mount (or App.hydrate, or Server.render), or ship the store beside the component that needs it with TheStore.with(Component).

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_WAIT_IN_COMPONENT

A component's Effect does not wait. Whatever it waits for holds back every component below it, and their queries start late: a waterfall.

Fix: Declare the data with a Query and ask for it (yield* TheQuery.ask(input)); the handle is there at once and the view shows its status.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_BACKEND_AROUND_SPAR

fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, FetchHttpClient.layer, a socket dialled with Socket.makeWebSocket and other client libraries go around Backend, so the call is not a span or an entry in the log.

Fix: Call a backend through Backend: Backend.rpc for an Effect RPC group, the HttpClient that Backend.layer provides for HttpApi and JSON clients, or Backend.layerSocket for a WebSocket.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_COMPONENT_WAITED

A component took a frame or more before its children could mount, so their queries started late.

Fix: Find what its Effect waits for, usually a service call that loads data, and move it to a Query the component asks for.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_QUERY_CHAIN

Requests ran one after another: each could start only when the one before had answered.

Fix: If a later request does not need the earlier answer, make its input from something that is there already (a route param, a prop, a store), so they start together. If it does need it, have the backend answer both in one call, or preload the page.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_PART_CRASHED

A part of the page crashed.

Fix: Read the defect that follows. If the part is wrapped in View.crash the rest of the page kept working; fix the cause in the component the report names.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_DUPLICATE_CALL

The same request was made again while an identical one was still on its way.

Fix: Load it once with a Query and let each component that needs it ask for it (yield* TheQuery.ask(input)): one request runs for each input and everyone shares the answer. Do not fetch in a component and pass the data down, and do not fetch the same thing once in each row.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_TYPING_REPLACED

A field the user typed in was given a different value by something that began before their last keystroke, so what they typed since was replaced.

Fix: A text input's value can only be UI state or a form field (anything else is a type error), so this comes from writing that UI state from something slow. Do not copy a saved or loaded value back into a field that is being edited. Keep what is typed as its own state (a form field or UI state) and keep the server's copy beside it: show the field as saved when the answer matches what was sent, and never write the answer into the draft. If the answer must win, apply it only when the field's text is still what was sent.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_REFUSALS_PILED_UP

A command was refused three times while one task of its store ran. Something kept asking for what the store would not do, usually a button that still looks pressable.

Fix: Show that the work is under way and stop offering the command while it runs: read store.running.<task> to disable or hide what sends it. If the command should work while the task runs, take it out of the task's refuses. If pressing again should start over, give the task mode: "switch" and leave it out of its own refuses.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_DUPLICATE_KEY

A keyed list has rows that share a key.

Fix: Give each row its own key in Reactive.mapBy, for example the row's id and not its index or label.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_UNKNOWN_ACTION

The log holds an action this store does not define.

Fix: Load the log into the version of the store that wrote it, or add the action back.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_COMPONENT_OUTSIDE_A_VIEW

A component was written in JSX that is not drawn by a component, so it has no services to run with.

Fix: Put the component's JSX in the inline view at the end of a compose(...)(...), or in a For or Show inside one.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_NO_PAGE_ON_SERVER

There is no page on a server.

Fix: Do not measure, focus or scroll while rendering on the server. Do it in a handler or after the browser has taken over.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_NOT_ON_SCREEN

A test expected something and the screen never showed it.

Fix: Check the role and name asked for against what the view draws, and that the data it needs was provided in the test's layer.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_PLAY_NOT_SETTLED

A Play test waited for the page to stop changing, and it kept changing.

Fix: Look for work that never ends without waiting on time: a loop that writes on every round, or a stream that never pauses. Work that waits on time is moved with TestClock.adjust and does not keep a page from settling.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_PLAY_NOT_ON_PAGE

A Play test asked for something by role and name, and the settled page did not have it.

Fix: Check the role and name against what the view draws, and that the test's layer answers what the page needs. A Play waits only until the page settles; time that has to pass is moved with TestClock.adjust first.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_REPLAY_DIVERGED

A recorded session was replayed against the store, and one of its steps made a different state than it did when it was recorded.

Fix: Read the step the report names, and the recorded and replayed states beside it. If the change is a bug, fix the action's reducer. If the new state is right, record the session again from the devtools.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_REPLAY_UNREADABLE

A recorded session holds a state or payload that the store's schemas no longer read.

Fix: The store's state or that action's payload schema changed since the session was recorded. Record it again, or keep the old shape readable with a Schema transformation.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_NEEDLESS_WAIT

A query that takes no input was given one, such as a value made from another query. It would wait for that value for nothing, so it does not compile: the argument is not assignable to parameter of type 'void' (TS2345).

Fix: Ask for it with no argument, yield* TheQuery.ask(), so it starts with the others. Give a query an input made from another query's value only when its request needs that value.

Reported by: The TypeScript compiler, in the text of a type error.

### SPAR_UNHANDLED_FAILURE

Query.valueOf was given a query that can fail. It reads only the value, so a failure would show as nothing at all, as if still loading. It does not compile: the handle is not assignable to SPAR_UNHANDLED_FAILURE (TS2345).

Fix: Say what the view shows when it fails: Query.shown(handle, { loading, failed, loaded }) for every state, or Query.valueOr(handle, (error) => fallback) for a value to use in its place. Query.valueOf is for queries whose failure is Schema.Never.

Reported by: The TypeScript compiler, in the text of a type error.

### SPAR_REDUCER_STATE_UNTYPED

A store action's reducer has no type on its state parameter, so the store's state is unknown. The compiler then also says a command comes from an index signature (TS4111) or is possibly undefined (TS2722).

Fix: Give the reducer its state type: Store.action(Payload, (state: State, payload) => ...). Every reducer in the store needs it.

Reported by: The TypeScript compiler, in the text of a type error.

### SPAR_ROUTE_UNDER_CLOSED

A route was declared under a route that does not end with /*.

Fix: End the parent route's path with /* so it is a layout that has routes under it.

Reported by: The TypeScript compiler, in the text of a type error.

### SPAR_TOOL_NO_STORE

An agent asked about a store the open app does not have.

Fix: Call list_stores for the ones there are.

Reported by: The agents' server, as the reason a tool call failed.

### SPAR_TOOL_NO_COMPONENT

An agent asked about a place where no component is mounted.

Fix: Call list_components for the ones there are.

Reported by: The agents' server, as the reason a tool call failed.

### SPAR_TOOL_NO_UI_STATE

An agent set UI state that is not there, or with a value that does not fit its Schema.

Fix: Call get_ui_state for each component's UI state by path and name, and send a value of the same shape.

Reported by: The agents' server, as the reason a tool call failed.

### SPAR_TOOL_NO_TOOL

The shell command named a tool the agents' server does not have.

Fix: Run "tools" to list the ones there are.

Reported by: The agents' server, as the reason a tool call failed.

### SPAR_TOOL_NO_PAGE

An agent chose a page that is not open.

Fix: Call list_pages for the ones there are.

Reported by: The agents' server, as the reason a tool call failed.

### HOUSE_NO_LOOPS

A for, for-in, for-of, while or do-while loop.

Fix: Use Array methods, Effect.forEach or recursion.

Reported by: The linter, as house(no-loops), with the file and line.

### HOUSE_NO_LET

A let or var declaration.

Fix: Use const. Where a value is built in steps, give each step its own name or use a reduce.

Reported by: The linter, as house(no-let), with the file and line.

### HOUSE_NO_MUTATION

A property assignment, Object.assign onto an existing value, or a method that changes an array in place.

Fix: Build a new value: spread into a new object or array, or use toSorted, toReversed and the like.

Reported by: The linter, as house(no-mutation), with the file and line.

### HOUSE_NO_COMMENTS

A comment in the code.

Fix: Remove it and let names, types and structure carry the meaning.

Reported by: The linter, as house(no-comments), with the file and line.

### HOUSE_NO_NESTED_IF

An if inside an if.

Fix: Use guard clauses that return early, or move the inner condition into a named helper.

Reported by: The linter, as house(no-nested-if), with the file and line.

### HOUSE_NO_MULTILINE_LOGICAL

A chain of && or || that runs over several lines.

Fix: Move the condition into a named helper made of one-line guard clauses.

Reported by: The linter, as house(no-multiline-logical), with the file and line.

### HOUSE_NO_CASTS

A type cast (as, or an angle-bracket assertion).

Fix: Restructure until it typechecks: decode with a Schema, narrow with a guard, or fix the type at its source.

Reported by: The linter, as house(no-casts), with the file and line.

### HOUSE_DETERMINISTIC

Date, Date.now, Math.random or crypto used directly.

Fix: Use DateTime and the Clock and Crypto services, so time and randomness can be set in a test.

Reported by: The linter, as house(deterministic), with the file and line.

### HOUSE_RUN_AT_ENTRY_ONLY

Effect.run* or runMain outside an entry point.

Fix: Return the Effect and let src/main.ts, or a file in scripts/ or tools/, run it.

Reported by: The linter, as house(run-at-entry-only), with the file and line.

### HOUSE_NO_GEN_WRAPPER

A function whose whole body returns Effect.gen.

Fix: Write it as Effect.fn or Effect.fnUntraced.

Reported by: The linter, as house(no-gen-wrapper), with the file and line.
