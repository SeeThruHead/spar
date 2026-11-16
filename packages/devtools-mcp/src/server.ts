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
import { Store } from "spar"
import { PageRpcs } from "./protocol.ts"
import type { Ask, Command, Snapshot } from "./protocol.ts"

const noPage = "No page answered. Open the app with the devtools link turned on."

export class Pages extends Context.Service<
  Pages,
  {
    readonly report: (stores: ReadonlyArray<Snapshot>) => Effect.Effect<void>
    readonly commands: Stream.Stream<Command>
    readonly settle: (id: string, problem: string | null) => Effect.Effect<void>
    readonly stores: Effect.Effect<ReadonlyArray<Snapshot>>
    readonly ask: (ask: Ask) => Effect.Effect<void, string>
  }
>()("@spar/devtools-mcp/Pages") {
  static readonly layer = Layer.effect(
    Pages,
    Effect.gen(function* () {
      const latest = yield* Ref.make<ReadonlyArray<Snapshot>>([])
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
        report: (stores) => Ref.set(latest, stores),
        commands: Stream.fromQueue(asked),
        settle,
        stores: Ref.get(latest),
        ask,
      }
    }),
  )
}

const PageHandlers = PageRpcs.toLayer(
  Effect.gen(function* () {
    const pages = yield* Pages

    return {
      Report: ({ stores }) => pages.report(stores),
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

export const Tools = Toolkit.make(ListStores, GetState, GetLog, TravelTo, RunAction, LoadLog)

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
    const after = (wanted: Ask) =>
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
