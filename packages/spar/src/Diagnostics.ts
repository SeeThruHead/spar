import { atRun, described, type Diagnostic, type Where } from "./internal/said.ts"

export { brief, guide, locationIn, type Diagnostic, type Kind } from "./internal/said.ts"

const atBuild = {
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
    fix: "Do the work in one of the component's enhancers and pass the result in as a prop.",
  },
  SPAR_STATE_OUTSIDE_STORE: {
    kind: "build",
    what: "A Ref, a SubscriptionRef or a variable that is assigned again is state the log cannot see.",
    fix: "Hold state in a Store (Store.Tag, placed with .layer or beside a view with .with) or in UiState.make, so every change is an action in the one log the devtools read.",
  },
  SPAR_ENHANCER_UNTYPED: {
    kind: "build",
    what: "An enhancer written inline as a function with an untyped parameter, followed by more enhancers. TypeScript works such a function out last, so every enhancer after it sees its props as unknown.",
    fix: "Wrap it: withEffectProps((props) => effect) for props made by an Effect, withHandlers((props) => values) for plain values. Or give its parameter a type, or move it to a named function with a typed parameter.",
  },
  SPAR_CHILD_NEEDS_A_SERVICE: {
    kind: "build",
    what: "A component drawn inside another needs a service that nothing above it provides: not the layer given to App.mount, and not a store beside a component it is drawn in. TypeScript cannot see this through JSX, so the build checks it.",
    fix: "Add the service's layer to the layer given to App.mount (or App.hydrate, or Server.render), or ship the store beside the component that needs it with TheStore.with(Component).",
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
} as const satisfies Readonly<Record<string, Diagnostic>>

const elsewhere = {
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

export const all = { ...atBuild, ...atRun, ...elsewhere }

export type Code = keyof typeof all

export const text = (code: Code, options: Where): string => described(code, all[code], options)
