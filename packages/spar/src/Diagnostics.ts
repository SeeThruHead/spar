export type Kind = "build" | "run" | "refusal" | "types" | "tools"

export type Diagnostic = {
  readonly kind: Kind
  readonly what: string
  readonly fix: string
}

export const all = {
  SPAR_JSX_OUTSIDE_VIEW: {
    kind: "build",
    what: "JSX can only be the body of a view. Inside an expression or a call it becomes template control flow.",
    fix: "Give it its own view, and use Reactive.when or Reactive.mapBy in the component's Effect.",
  },
  SPAR_VIEW_WITHOUT_SCHEMA: {
    kind: "build",
    what: "A plain function that returns JSX has no Schema for its props.",
    fix: "Make the view with View.make(name, props, draw), where props gives a Schema for each prop.",
  },
  SPAR_EFFECT_RUN_IN_VIEW: {
    kind: "build",
    what: "A view cannot run an Effect.",
    fix: "Do the work in the component's Effect (View.connect) and pass the result in as a prop.",
  },
  SPAR_STATE_OUTSIDE_STORE: {
    kind: "build",
    what: "A Ref, a SubscriptionRef or a variable that is assigned again is state the log cannot see.",
    fix: "Hold state in a Store (Store.Tag, placed with .layer or beside a view with .with) or in UiState.make, so every change is an action in the one log the devtools read.",
  },
  SPAR_WAIT_IN_COMPONENT: {
    kind: "build",
    what: "A component's Effect does not wait. Whatever it waits for holds back every component below it, and their queries start late: a waterfall.",
    fix: "Declare the data with a Query and ask for it (yield* TheQuery.ask(input)); the handle is there at once and the view shows its status.",
  },
  SPAR_BACKEND_AROUND_SPAR: {
    kind: "build",
    what: "fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, FetchHttpClient.layer, a socket dialled with Socket.makeWebSocket and other client libraries go around Backend, so the call is not a span or an entry in the log.",
    fix: "Call a backend through Backend: Backend.rpc for an Effect RPC group, the HttpClient that Backend.layer provides for HttpApi and JSON clients, or Backend.layerSocket for a WebSocket.",
  },
  SPAR_COMPONENT_WAITED: {
    kind: "run",
    what: "A component took a frame or more before its children could mount, so their queries started late.",
    fix: "Find what its Effect waits for, usually a service call that loads data, and move it to a Query the component asks for.",
  },
  SPAR_QUERY_CHAIN: {
    kind: "run",
    what: "Requests ran one after another: each could start only when the one before had answered.",
    fix: "If a later request does not need the earlier answer, make its input from something that is there already (a route param, a prop, a store), so they start together. If it does need it, have the backend answer both in one call, or preload the page.",
  },
  SPAR_PART_CRASHED: {
    kind: "run",
    what: "A part of the page crashed.",
    fix: "Read the defect that follows. If the part is wrapped in View.crash the rest of the page kept working; fix the cause in the component the report names.",
  },
  SPAR_NEEDLESS_WAIT: {
    kind: "run",
    what: "A query that takes no input waits for another query's value before it starts.",
    fix: "Ask for it with no argument, yield* TheQuery.ask(), so it starts with the others. Give a query an input made from another query's value only when its request needs that value.",
  },
  SPAR_SENT_AGAIN: {
    kind: "run",
    what: "The same command, with the same payload, was sent again while the work the first one started was still running.",
    fix: "If the second send is a mistake, such as a second press of Pay, give the action a guard that refuses it while the first is in progress (Store.action's third argument), or submit through Form.submit, which ignores a submit while one is running. If repeating it is meant, put something in the payload that tells the two apart.",
  },
  SPAR_DUPLICATE_KEY: {
    kind: "run",
    what: "A keyed list has rows that share a key.",
    fix: "Give each row its own key in Reactive.mapBy, for example the row's id and not its index or label.",
  },
  SPAR_UNKNOWN_ACTION: {
    kind: "run",
    what: "The log holds an action this store does not define.",
    fix: "Load the log into the version of the store that wrote it, or add the action back.",
  },
  SPAR_UNREADABLE_SAVE: {
    kind: "run",
    what: "What was saved for a store on this device could not be read.",
    fix: "Clear the saved data, or read it with the version that wrote it. If the state's Schema changed, give the store's durable options a new version.",
  },
  SPAR_ABANDONED_ACTION: {
    kind: "run",
    what: "An earlier tab asked a store for an action and closed before it was done, and this version cannot carry it out, so it was dropped.",
    fix: "Nothing to do for the dropped action. To keep such actions across versions, keep the action's name and payload Schema readable by the new version.",
  },
  SPAR_NO_PAGE_ON_SERVER: {
    kind: "run",
    what: "There is no page on a server.",
    fix: "Do not measure, focus or scroll while rendering on the server. Do it in a handler or after the browser has taken over.",
  },
  SPAR_NOT_ON_SCREEN: {
    kind: "run",
    what: "A test expected something and the screen never showed it.",
    fix: "Check the role and name asked for against what the view draws, and that the data it needs was provided in the test's layer.",
  },
  SPAR_ALREADY_LOADING: {
    kind: "refusal",
    what: "It is already loading",
    fix: "Nothing: one request runs for each input at a time, and the second was not needed.",
  },
  SPAR_LATE_ANSWER: {
    kind: "refusal",
    what: "This answers an earlier request",
    fix: "Nothing: a newer request was made for the same input, and its answer is the one kept.",
  },
  SPAR_IN_USE_AGAIN: {
    kind: "refusal",
    what: "It is in use again",
    fix: "Nothing: a query's data was about to be dropped as unused, and a component asked for it again first.",
  },
  SPAR_REDUCER_STATE_UNTYPED: {
    kind: "types",
    what: "A store action's reducer has no type on its state parameter, so the store's state is unknown. The compiler then also says a command comes from an index signature (TS4111) or is possibly undefined (TS2722).",
    fix: "Give the reducer its state type: Store.action(Payload, (state: State, payload) => ...). Every reducer in the store needs it.",
  },
  SPAR_ROUTE_UNDER_CLOSED: {
    kind: "types",
    what: "A route was declared under a route that does not end with /*.",
    fix: "End the parent route's path with /* so it is a layout that has routes under it.",
  },
  SPAR_TOOL_NO_STORE: {
    kind: "tools",
    what: "An agent asked about a store the open app does not have.",
    fix: "Call list_stores for the ones there are.",
  },
  SPAR_TOOL_NO_COMPONENT: {
    kind: "tools",
    what: "An agent asked about a place where no component is mounted.",
    fix: "Call list_components for the ones there are.",
  },
  SPAR_TOOL_NO_UI_STATE: {
    kind: "tools",
    what: "An agent set UI state that is not there, or with a value that does not fit its Schema.",
    fix: "Call get_ui_state for each component's UI state by path and name, and send a value of the same shape.",
  },
  SPAR_TOOL_NO_TOOL: {
    kind: "tools",
    what: "The shell command named a tool the agents' server does not have.",
    fix: 'Run "tools" to list the ones there are.',
  },
  SPAR_TOOL_NO_PAGE: {
    kind: "tools",
    what: "An agent chose a page that is not open.",
    fix: "Call list_pages for the ones there are.",
  },
} as const satisfies Readonly<Record<string, Diagnostic>>

const frame = /\(?([^()\s@]+):(\d+):(\d+)\)?$/

const withoutOrigin = (address: string): string =>
  address.replace(/^[a-z]+:\/\/[^/]*/, "").replace(/\?[^:]*/, "")

export const locationIn = (stack: string | undefined, skip: number): string =>
  (stack ?? "")
    .split("\n")
    .flatMap((line) => {
      const parts = frame.exec(line.trim())

      return parts === null ? [] : [withoutOrigin(parts.slice(1).join(":"))]
    })
    .at(skip) ?? ""

export type Code = keyof typeof all

export const guide = (code: Code): string => `LLMS.md, section "${code}"`

export const brief = (code: Code): string => `[${code}] ${all[code].what}`

export const text = (
  code: Code,
  options: {
    readonly said?: string
    readonly in?: ReadonlyArray<string>
    readonly at?: string
  } = {},
): string =>
  [
    `[${code}] ${options.said ?? all[code].what}`,
    ...(options.in === undefined || options.in.length === 0
      ? []
      : [`  in ${options.in.join(" > ")}`]),
    ...(options.at === undefined || options.at === "" ? [] : [`  at ${options.at}`]),
    `  fix: ${all[code].fix}`,
    `  see: ${guide(code)}`,
  ].join("\n")
