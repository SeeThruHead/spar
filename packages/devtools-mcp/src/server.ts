import {
  Context,
  Deferred,
  Effect,
  Exit,
  HashMap,
  Layer,
  Option,
  Queue,
  Ref,
  Schema,
  Stream,
} from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import { HttpRouter } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { Store, Timeline, UiState } from "spar"
import * as Devtools from "spar/devtools"
import * as Spans from "spar/devtools/spans"
import { PageRpcs } from "./protocol.ts"
import type { Ask, Command, Page, Snapshot } from "./protocol.ts"

const noPage = "No page answered. Open the app with the devtools link turned on."

export class Pages extends Context.Service<
  Pages,
  {
    readonly report: (page: Page) => Effect.Effect<void>
    readonly page: Effect.Effect<Page>
    readonly commands: Stream.Stream<Command>
    readonly settle: (id: string, problem: string | null) => Effect.Effect<void>
    readonly stores: Effect.Effect<ReadonlyArray<Snapshot>>
    readonly ask: (ask: Ask) => Effect.Effect<void, string>
  }
>()("@spar/devtools-mcp/Pages") {
  static readonly layer = Layer.effect(
    Pages,
    Effect.gen(function* () {
      const latest = yield* Ref.make<Page>({
        stores: [],
        ui: [],
        moments: [],
        viewing: null,
        components: [],
        spans: [],
      })
      const asked = yield* Queue.unbounded<Command>()
      const count = yield* Ref.make(0)
      const waiting = yield* Ref.make(HashMap.empty<string, Deferred.Deferred<void, string>>())

      const settle = Effect.fn("Pages.settle")(function* (id: string, problem: string | null) {
        const all = yield* Ref.getAndUpdate(waiting, HashMap.remove(id))

        yield* Effect.forEach(Option.toArray(HashMap.get(all, id)), (answer) =>
          Deferred.done(answer, problem === null ? Exit.void : Exit.fail(problem)),
        )
      })

      const ask = Effect.fn("Pages.ask")(function* (wanted: Ask) {
        const id = `${yield* Ref.updateAndGet(count, (last) => last + 1)}`
        const answer = yield* Deferred.make<void, string>()

        yield* Ref.update(waiting, HashMap.set(id, answer))
        yield* Queue.offer(asked, { id, ask: wanted })
        yield* Deferred.await(answer).pipe(
          Effect.timeoutOrElse({
            duration: "5 seconds",
            orElse: () => Effect.andThen(settle(id, noPage), Effect.fail(noPage)),
          }),
        )
      })

      return {
        report: (page) => Ref.set(latest, page),
        page: Ref.get(latest),
        commands: Stream.fromQueue(asked),
        settle,
        stores: Effect.map(Ref.get(latest), (page) => page.stores),
        ask,
      }
    }),
  )
}

const PageHandlers = PageRpcs.toLayer(
  Effect.gen(function* () {
    const pages = yield* Pages

    return {
      Report: ({ page }) => pages.report(page),
      Commands: () => pages.commands,
      Outcome: ({ id, problem }) => pages.settle(id, problem),
    }
  }),
)

const Listed = Schema.Struct({
  store: Schema.String,
  viewing: Schema.NullOr(Schema.Int),
  actions: Schema.Int,
})

const store = Schema.String.annotate({ description: "The store's key, as list_stores gives it" })

const ListStores = Tool.make("list_stores", {
  description:
    "The stores of the open app: each one's key, how many actions it has logged, and which action is being viewed (null when live).",
  parameters: Tool.EmptyParams,
  success: Schema.Array(Listed),
})

const GetState = Tool.make("get_state", {
  description: "A store's state as the page shows it now, as JSON text.",
  parameters: Schema.Struct({ store }),
  success: Schema.String,
  failure: Schema.String,
})

const GetLog = Tool.make("get_log", {
  description:
    "The actions a store has recorded, oldest first. Give `last` to get only the newest few.",
  parameters: Schema.Struct({ store, last: Schema.optional(Schema.Int) }),
  success: Store.Entries,
  failure: Schema.String,
})

const TravelTo = Tool.make("travel_to", {
  description:
    "Show the page as it was after the action with this seq, or pass null to go back to live. Returns the state shown.",
  parameters: Schema.Struct({ store, seq: Schema.NullOr(Schema.Int) }),
  success: Schema.String,
  failure: Schema.String,
})

const RunAction = Tool.make("run_action", {
  description:
    "Carry out one of a store's actions with a payload, exactly as the app would. Returns the new state.",
  parameters: Schema.Struct({ store, action: Schema.String, payload: Schema.Json }),
  success: Schema.String,
  failure: Schema.String,
})

const LoadLog = Tool.make("load_log", {
  description:
    "Replay a log of actions from the store's first state and show the result, without changing the live state. travel_to with null returns to live.",
  parameters: Schema.Struct({ store, entries: Store.Entries }),
  success: Schema.String,
  failure: Schema.String,
})

const GetUiState = Tool.make("get_ui_state", {
  description:
    "Every piece of UI state in the open app, each with the path of the component that owns it, its name and its value now.",
  parameters: Tool.EmptyParams,
  success: UiState.Snapshot,
})

const SetUiState = Tool.make("set_ui_state", {
  description:
    "Set one piece of UI state, as get_ui_state names it. Refused when the value does not fit its Schema. Returns the UI state after.",
  parameters: Schema.Struct({
    path: Schema.Array(Schema.String),
    name: Schema.String,
    value: Schema.Json,
  }),
  success: UiState.Snapshot,
  failure: Schema.String,
})

const GetTimeline = Tool.make("get_timeline", {
  description:
    "Everything that happened in the app in one order: store commands, UI state changes, route changes and data arriving, each with its trace id. Give `last` for only the newest few. `viewing` is the moment being shown, or null for now.",
  parameters: Schema.Struct({ last: Schema.optional(Schema.Int) }),
  success: Schema.Struct({
    viewing: Schema.NullOr(Schema.Int),
    moments: Schema.Array(Timeline.Moment),
  }),
})

const Rewind = Tool.make("rewind", {
  description:
    "Show the whole app, stores and UI state together, as it was after the moment with this seq; null returns to now. Returns the moment being shown.",
  parameters: Schema.Struct({ seq: Schema.NullOr(Schema.Int) }),
  success: Schema.NullOr(Schema.Int),
  failure: Schema.String,
})

const ListComponents = Tool.make("list_components", {
  description:
    "The components mounted in the open app: each one's view name and where it is in the tree. Give `name` to keep only those whose view name contains it.",
  parameters: Schema.Struct({ name: Schema.optional(Schema.String) }),
  success: Schema.Array(Schema.Struct({ name: Schema.String, place: Schema.String })),
})

const GetComponent = Tool.make("get_component", {
  description:
    "One component's data, by its place as list_components gives it: the props its view receives as plain values, its UI state, the services its Effect uses and the failures it recovers from.",
  parameters: Schema.Struct({ place: Schema.String }),
  success: Devtools.Component,
  failure: Schema.String,
})

const GetTrace = Tool.make("get_trace", {
  description:
    "The spans the page recorded for one trace id, as get_timeline gives it: name, parent, start and end in milliseconds, and whether it failed.",
  parameters: Schema.Struct({ traceId: Schema.String }),
  success: Schema.Array(Spans.Recorded),
})

export const Tools = Toolkit.make(
  ListStores,
  GetState,
  GetLog,
  TravelTo,
  RunAction,
  LoadLog,
  GetUiState,
  SetUiState,
  GetTimeline,
  Rewind,
  ListComponents,
  GetComponent,
  GetTrace,
)

const ToolHandlers = Tools.toLayer(
  Effect.gen(function* () {
    const pages = yield* Pages
    const found = (key: string) =>
      Effect.flatMap(pages.stores, (stores) =>
        Effect.mapError(
          Effect.fromNullishOr(stores.find((each) => each.store === key)),
          () => `There is no store called ${key}. list_stores gives the ones there are.`,
        ),
      )
    const after = (wanted: Extract<Ask, { readonly store: string }>) =>
      Effect.andThen(
        pages.ask(wanted),
        Effect.map(found(wanted.store), (now) => now.state),
      )

    return {
      list_stores: () =>
        Effect.map(pages.stores, (stores) =>
          stores.map((each) => ({
            store: each.store,
            viewing: each.viewing,
            actions: each.log.length,
          })),
        ),
      get_state: ({ store: key }) => Effect.map(found(key), (now) => now.state),
      get_log: ({ store: key, last }) =>
        Effect.map(found(key), (now) => now.log.slice(-(last ?? now.log.length))),
      travel_to: ({ store: key, seq }) => after({ _tag: "TravelTo", store: key, seq }),
      run_action: ({ store: key, action, payload }) =>
        after({ _tag: "Run", store: key, action, payload }),
      load_log: ({ store: key, entries }) => after({ _tag: "Load", store: key, entries }),
      get_ui_state: () => Effect.map(pages.page, (page) => page.ui),
      set_ui_state: ({ path, name, value }) =>
        Effect.andThen(
          pages.ask({ _tag: "SetUi", path, name, value }),
          Effect.map(pages.page, (page) => page.ui),
        ),
      get_timeline: ({ last }) =>
        Effect.map(pages.page, (page) => ({
          viewing: page.viewing,
          moments: page.moments.slice(-(last ?? page.moments.length)),
        })),
      rewind: ({ seq }) =>
        Effect.andThen(
          pages.ask({ _tag: "Rewind", seq }),
          Effect.map(pages.page, (page) => page.viewing),
        ),
      list_components: ({ name }) =>
        Effect.map(pages.page, (page) =>
          page.components
            .filter((each) => each.name.includes(name ?? ""))
            .map((each) => ({ name: each.name, place: each.place })),
        ),
      get_component: ({ place }) =>
        Effect.flatMap(pages.page, (page) =>
          Effect.mapError(
            Effect.fromNullishOr(page.components.findLast((each) => each.place === place)),
            () => `There is no component at ${place}. list_components gives the ones there are.`,
          ),
        ),
      get_trace: ({ traceId }) =>
        Effect.map(pages.page, (page) => page.spans.filter((span) => span.traceId === traceId)),
    }
  }),
)

export const layer = Layer.mergeAll(
  RpcServer.layerHttp({ group: PageRpcs, path: "/page", protocol: "http" }).pipe(
    Layer.provide(PageHandlers),
    Layer.provide(RpcSerialization.layerNdjson),
  ),
  McpServer.toolkit(Tools).pipe(
    Layer.provide(ToolHandlers),
    Layer.provide(
      McpServer.layerHttp({
        name: "Spar devtools",
        version: "0.0.0",
        path: "/mcp",
        protocols: [McpProtocol.v2025_11_25, McpProtocol.v2025_06_18, McpProtocol.v2025_03_26],
      }),
    ),
  ),
  HttpRouter.cors({ allowedOrigins: ["*"] }),
).pipe(Layer.provide(Pages.layer))
