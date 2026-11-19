# Diagnostics

Every error, refusal and lint finding Spar reports has a code that does not change. A report is
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

Fix: Do the work in the component's Effect (View.connect) and pass the result in as a prop.

Reported by: The build (the Vite or Bun plugin), with the file, line and column.

### SPAR_STATE_OUTSIDE_STORE

A Ref, a SubscriptionRef or a variable that is assigned again is state the log cannot see.

Fix: Hold state in a Store (Store.Tag, placed with .layer or beside a view with .with) or in UiState.make, so every change is an action in the one log the devtools read.

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

### SPAR_DUPLICATE_KEY

A keyed list has rows that share a key.

Fix: Give each row its own key in Reactive.mapBy, for example the row's id and not its index or label.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_UNKNOWN_ACTION

The log holds an action this store does not define.

Fix: Load the log into the version of the store that wrote it, or add the action back.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_UNREADABLE_SAVE

What was saved for a store on this device could not be read.

Fix: Clear the saved data, or read it with the version that wrote it. If the state's Schema changed, give the store's durable options a new version.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_ABANDONED_ACTION

An earlier tab asked a store for an action and closed before it was done, and this version cannot carry it out, so it was dropped.

Fix: Nothing to do for the dropped action. To keep such actions across versions, keep the action's name and payload Schema readable by the new version.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_NO_PAGE_ON_SERVER

There is no page on a server.

Fix: Do not measure, focus or scroll while rendering on the server. Do it in a handler or after the browser has taken over.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_NOT_ON_SCREEN

A test expected something and the screen never showed it.

Fix: Check the role and name asked for against what the view draws, and that the data it needs was provided in the test's layer.

Reported by: The running app: an error's message, or an entry in the log.

### SPAR_ALREADY_LOADING

It is already loading

Fix: Nothing: one request runs for each input at a time, and the second was not needed.

Reported by: A store, as the reason a command was refused. It is in the log and on the command's span.

### SPAR_LATE_ANSWER

This answers an earlier request

Fix: Nothing: a newer request was made for the same input, and its answer is the one kept.

Reported by: A store, as the reason a command was refused. It is in the log and on the command's span.

### SPAR_IN_USE_AGAIN

It is in use again

Fix: Nothing: a query's data was about to be dropped as unused, and a component asked for it again first.

Reported by: A store, as the reason a command was refused. It is in the log and on the command's span.

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
