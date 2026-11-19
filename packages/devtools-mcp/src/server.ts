import {
  Array,
  Context,
  Deferred,
  Effect,
  Equal,
  Exit,
  HashMap,
  Layer,
  Option,
  Order,
  Predicate,
  Queue,
  Ref,
  Schema,
  Stream,
} from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import { HttpRouter } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { Diagnostics, Store, Timeline, UiState } from "spar"
import * as Devtools from "spar/devtools"
import * as Spans from "spar/devtools/spans"
import { PageRpcs } from "./protocol.ts"
import type { Ask, Command, Page, Snapshot } from "./protocol.ts"

const noPage = "No page answered. Open the app with the devtools link turned on."

const nothingOpen: Page = {
  id: "",
  address: "",
  stores: [],
  ui: [],
  moments: [],
  viewing: null,
  branches: [],
  components: [],
  spans: [],
}

type Listed = { readonly id: string; readonly address: string; readonly current: boolean }

export class Pages extends Context.Service<
  Pages,
  {
    readonly report: (page: Page) => Effect.Effect<void>
    readonly page: Effect.Effect<Page>
    readonly commands: (page: string) => Stream.Stream<Command>
    readonly settle: (id: string, problem: string | null) => Effect.Effect<void>
    readonly stores: Effect.Effect<ReadonlyArray<Snapshot>>
    readonly ask: (ask: Ask) => Effect.Effect<void, string>
    readonly listed: Effect.Effect<ReadonlyArray<Listed>>
    readonly choose: (page: string) => Effect.Effect<void, string>
  }
>()("@spar/devtools-mcp/Pages") {
  static readonly layer = Layer.effect(
    Pages,
    Effect.gen(function* () {
      const reports = yield* Ref.make(HashMap.empty<string, Page>())
      const chosen = yield* Ref.make(Option.none<string>())
      const last = yield* Ref.make("")
      const queues = yield* Ref.make(HashMap.empty<string, Queue.Queue<Command>>())
      const count = yield* Ref.make(0)
      const waiting = yield* Ref.make(HashMap.empty<string, Deferred.Deferred<void, string>>())

      const current = Effect.gen(function* () {
        const all = yield* Ref.get(reports)
        const picked = yield* Ref.get(chosen)
        const latest = yield* Ref.get(last)

        return Option.getOrElse(
          Option.filter(picked, (id) => HashMap.has(all, id)),
          () => latest,
        )
      })

      const queueOf = Effect.fnUntraced(function* (page: string) {
        const fresh = yield* Queue.unbounded<Command>()

        return yield* Ref.modify(queues, (all) =>
          Option.match(HashMap.get(all, page), {
            onNone: () => [fresh, HashMap.set(all, page, fresh)] as const,
            onSome: (known) => [known, all] as const,
          }),
        )
      })

      const settle = Effect.fn("Pages.settle")(function* (id: string, problem: string | null) {
        const all = yield* Ref.getAndUpdate(waiting, HashMap.remove(id))

        yield* Effect.forEach(Option.toArray(HashMap.get(all, id)), (answer) =>
          Deferred.done(answer, problem === null ? Exit.void : Exit.fail(problem)),
        )
      })

      const ask = Effect.fn("Pages.ask")(function* (wanted: Ask) {
        const id = `${yield* Ref.updateAndGet(count, (seen) => seen + 1)}`
        const answer = yield* Deferred.make<void, string>()
        const page = yield* current
        const queue = yield* queueOf(page)

        yield* Ref.update(waiting, HashMap.set(id, answer))
        yield* Queue.offer(queue, { id, ask: wanted })
        yield* Deferred.await(answer).pipe(
          Effect.timeoutOrElse({
            duration: "5 seconds",
            orElse: () => Effect.andThen(settle(id, noPage), Effect.fail(noPage)),
          }),
        )
      })

      const page = Effect.flatMap(current, (id) =>
        Effect.map(Ref.get(reports), (all) =>
          Option.getOrElse(HashMap.get(all, id), () => nothingOpen),
        ),
      )

      return {
        report: (reported) =>
          Effect.andThen(
            Ref.update(reports, HashMap.set(reported.id, reported)),
            Ref.set(last, reported.id),
          ),
        page,
        commands: (id) =>
          Stream.unwrap(
            Effect.map(Effect.all([queueOf(""), queueOf(id)]), ([unaddressed, own]) =>
              Stream.merge(Stream.fromQueue(unaddressed), Stream.fromQueue(own)),
            ),
          ),
        settle,
        stores: Effect.map(page, (now) => now.stores),
        ask,
        listed: Effect.flatMap(current, (id) =>
          Effect.map(Ref.get(reports), (all) =>
            [...HashMap.values(all)].map((each) => ({
              id: each.id,
              address: each.address,
              current: each.id === id,
            })),
          ),
        ),
        choose: (id) =>
          Effect.flatMap(Ref.get(reports), (all) =>
            HashMap.has(all, id)
              ? Ref.set(chosen, Option.some(id))
              : Effect.fail(
                  Diagnostics.text("SPAR_TOOL_NO_PAGE", { said: `There is no page called ${id}.` }),
                ),
          ),
      }
    }),
  )
}

const PageHandlers = PageRpcs.toLayer(
  Effect.gen(function* () {
    const pages = yield* Pages

    return {
      Report: ({ page }) => pages.report(page),
      Commands: ({ page }) => pages.commands(page),
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

const ListPages = Tool.make("list_pages", {
  description:
    "The pages linked to this server: each one's id, its address, and whether it is the one the other tools speak for. That is the one chosen with use_page, or else the one that reported last.",
  parameters: Tool.EmptyParams,
  success: Schema.Array(
    Schema.Struct({ id: Schema.String, address: Schema.String, current: Schema.Boolean }),
  ),
})

const UsePage = Tool.make("use_page", {
  description:
    "Make one linked page, by its id as list_pages gives it, the one every other tool speaks for. Returns the pages.",
  parameters: Schema.Struct({ page: Schema.String }),
  success: Schema.Array(
    Schema.Struct({ id: Schema.String, address: Schema.String, current: Schema.Boolean }),
  ),
  failure: Schema.String,
})

const GetActions = Tool.make("get_actions", {
  description:
    "A store's actions: each one's name and the JSON Schema of the payload it takes. Read this before run_action.",
  parameters: Schema.Struct({ store }),
  success: Schema.Array(Schema.Struct({ name: Schema.String, payload: Schema.Json })),
  failure: Schema.String,
})

const RunActions = Tool.make("run_actions", {
  description:
    "Carry out several of a store's actions in order, each exactly as the app would. Stops at the first that cannot be carried out. Returns the state after.",
  parameters: Schema.Struct({
    store,
    actions: Schema.Array(Schema.Struct({ action: Schema.String, payload: Schema.Json })),
  }),
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

const Branches = Schema.Array(Devtools.Branch)

const ListBranches = Tool.make("list_branches", {
  description:
    "The branches of the running program: Main, and one for each fork. Each has its id, the moment it was forked at, how many moments it holds, and whether it is the one running now.",
  parameters: Tool.EmptyParams,
  success: Branches,
})

const Fork = Tool.make("fork", {
  description:
    "Fork the running program at the moment being shown (rewind or step first), or at the last moment when it is live. The app carries on from there in a new branch and the original is kept. Returns the branches.",
  parameters: Tool.EmptyParams,
  success: Branches,
  failure: Schema.String,
})

const SwitchBranch = Tool.make("switch_branch", {
  description:
    "Make another branch the running one, by its id as list_branches gives it. The branch left is kept as it was. Returns the branches.",
  parameters: Schema.Struct({ branch: Schema.Int }),
  success: Branches,
  failure: Schema.String,
})

const Step = Tool.make("step", {
  description:
    "Move one moment earlier (-1) or later (1) in the log and show the whole app as it was then. Returns the moment now shown (null when back at the present) and every span of the trace that moment belongs to, from the page and, when the page has joined them, the backend.",
  parameters: Schema.Struct({ by: Schema.Literals([-1, 1]) }),
  success: Schema.Struct({
    moment: Schema.NullOr(Timeline.Moment),
    spans: Schema.Array(Spans.Recorded),
  }),
  failure: Schema.String,
})

const CountMoments = Tool.make("count_moments", {
  description:
    "How many times each thing happened in the log, most frequent first: one row per kind and name (a store action, a piece of UI state, a route, a backend call).",
  parameters: Tool.EmptyParams,
  success: Schema.Array(
    Schema.Struct({ kind: Timeline.Kind, name: Schema.String, count: Schema.Int }),
  ),
})

const Changed = Schema.Struct({
  path: Schema.String,
  before: Schema.optional(Schema.Json),
  after: Schema.optional(Schema.Json),
})

const DiffStates = Tool.make("diff_states", {
  description:
    "What changed in one store between two of its actions, by seq as get_log gives them: one row for each path whose value differs, with the value before and after (missing when the path did not exist on that side). The page is left showing what it showed before.",
  parameters: Schema.Struct({ store, from: Schema.Int, to: Schema.Int }),
  success: Schema.Array(Changed),
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
    "The spans the page recorded for one trace id, as get_timeline gives it: name, parent, start and end in milliseconds, whether it failed, and its attributes. Give `lens` to keep one kind: rendering (components mounting), data (queries and the calls they make, with what each waited for in spar.query.after), stores (store commands and refusals).",
  parameters: Schema.Struct({ traceId: Schema.String, lens: Schema.optional(Spans.Lens) }),
  success: Schema.Array(Spans.Recorded),
})

export const Navigation = Schema.Struct({
  route: Schema.NullOr(Schema.String),
  traceId: Schema.NullOr(Schema.String),
  spans: Schema.Array(Spans.Recorded),
})

const GetNavigation = Tool.make("get_navigation", {
  description:
    "The newest route change and every span of its trace: the route, its trace id and the spans as get_trace gives them. Give `back` to count route changes back from the newest (1 is the one before), and `lens` to keep one kind of span. The route is null when the app has not changed route yet.",
  parameters: Schema.Struct({
    back: Schema.optional(Schema.Int),
    lens: Schema.optional(Spans.Lens),
  }),
  success: Navigation,
})

const navigationOf = (page: Page, back: number, lens: Spans.Lens) => {
  const route = page.moments.filter((each) => each.kind === "route").at(-1 - back)
  if (route === undefined) return { route: null, traceId: null, spans: [] }

  return {
    route: route.name,
    traceId: route.traceId,
    spans: page.spans.filter(
      (span) => span.traceId === route.traceId && Spans.inLens(lens, span, "page"),
    ),
  }
}

const steppedTo = (page: Page) => {
  const moment = page.moments.find((each) => each.seq === page.viewing) ?? null

  return {
    moment,
    spans: page.spans.filter((span) => moment !== null && span.traceId === moment.traceId),
  }
}

const countsOf = (moments: ReadonlyArray<Timeline.Moment>) =>
  Array.sort(
    Object.values(Array.groupBy(moments, (moment) => `${moment.kind} ${moment.name}`)).map(
      (same) => ({ kind: same[0].kind, name: same[0].name, count: same.length }),
    ),
    Order.mapInput(Order.flip(Order.Number), (row: { readonly count: number }) => row.count),
  )

const read = (state: string) =>
  Effect.orDie(Schema.decodeEffect(Schema.fromJsonString(Schema.Json))(state))

const isRecord = (value: Schema.Json | undefined): value is Schema.JsonObject =>
  Predicate.isObject(value) && !globalThis.Array.isArray(value)

export const changesBetween = (
  before: Schema.Json | undefined,
  after: Schema.Json | undefined,
  path = "",
): ReadonlyArray<typeof Changed.Type> => {
  if (isRecord(before) && isRecord(after)) {
    return Array.dedupe([...Object.keys(before), ...Object.keys(after)]).flatMap((key) =>
      changesBetween(before[key], after[key], path === "" ? key : `${path}.${key}`),
    )
  }
  if (Equal.equals(before, after)) return []

  return [
    {
      path,
      ...(before === undefined ? {} : { before }),
      ...(after === undefined ? {} : { after }),
    },
  ]
}

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
  GetNavigation,
  ListBranches,
  Fork,
  SwitchBranch,
  Step,
  CountMoments,
  DiffStates,
  GetActions,
  RunActions,
  ListPages,
  UsePage,
)

const ToolHandlers = Tools.toLayer(
  Effect.gen(function* () {
    const pages = yield* Pages
    const found = (key: string) =>
      Effect.flatMap(pages.stores, (stores) =>
        Effect.mapError(Effect.fromNullishOr(stores.find((each) => each.store === key)), () =>
          Diagnostics.text("SPAR_TOOL_NO_STORE", { said: `There is no store called ${key}.` }),
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
            () =>
              Diagnostics.text("SPAR_TOOL_NO_COMPONENT", {
                said: `There is no component at ${place}.`,
              }),
          ),
        ),
      get_trace: ({ traceId, lens }) =>
        Effect.map(pages.page, (page) =>
          page.spans.filter(
            (span) => span.traceId === traceId && Spans.inLens(lens ?? "all", span, "page"),
          ),
        ),
      get_navigation: ({ back, lens }) =>
        Effect.map(pages.page, (page) => navigationOf(page, back ?? 0, lens ?? "all")),
      list_pages: () => pages.listed,
      use_page: ({ page }) => Effect.andThen(pages.choose(page), pages.listed),
      get_actions: ({ store: key }) => Effect.map(found(key), (now) => now.actions),
      run_actions: ({ store: key, actions }) =>
        Effect.andThen(
          Effect.forEach(
            actions,
            ({ action, payload }) => pages.ask({ _tag: "Run", store: key, action, payload }),
            { discard: true },
          ),
          Effect.map(found(key), (now) => now.state),
        ),
      list_branches: () => Effect.map(pages.page, (page) => page.branches),
      fork: () =>
        Effect.andThen(
          pages.ask({ _tag: "Fork" }),
          Effect.map(pages.page, (page) => page.branches),
        ),
      switch_branch: ({ branch }) =>
        Effect.andThen(
          pages.ask({ _tag: "SwitchTo", branch }),
          Effect.map(pages.page, (page) => page.branches),
        ),
      step: ({ by }) =>
        Effect.andThen(pages.ask({ _tag: "Step", by }), Effect.map(pages.page, steppedTo)),
      count_moments: () => Effect.map(pages.page, (page) => countsOf(page.moments)),
      diff_states: Effect.fnUntraced(function* ({ store: key, from, to }) {
        const showing = yield* found(key)
        const before = yield* after({ _tag: "TravelTo", store: key, seq: from })
        const later = yield* after({ _tag: "TravelTo", store: key, seq: to })

        yield* pages.ask({ _tag: "TravelTo", store: key, seq: showing.viewing })

        const first = yield* read(before)
        const second = yield* read(later)

        return changesBetween(first, second)
      }),
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
