import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Query, Reactive, Renderer, Router, Server, Store, compose } from "spar"
import { NothingView, ShelfView, TeaView } from "./instantData.tsx"
import { valueOf } from "./results.ts"

class TeaQuery extends Query.Tag<TeaQuery>()("test/Tea", {
  input: Schema.String,
  success: Schema.String,
  failure: Schema.Never,
  load: (kind: string) => Effect.succeed(`${kind} tea`),
}) {}

const home = Router.route("/")

const Tea = compose(
  Effect.fnUntraced(function* () {
    const tea = yield* TeaQuery.ask("green")

    return { name: Reactive.map(valueOf(tea), (found) => found ?? "none yet") }
  }),
)(TeaView)

const Shelf = compose(
  Effect.fnUntraced(function* () {
    return {
      page: yield* Router.outlet({ routes: [Router.on(home, Tea)], otherwise: NothingView }),
    }
  }),
)(ShelfView)

class VisitsStore extends Store.Tag<VisitsStore>()("test/Visits", {
  state: Schema.Struct({ visits: Schema.Int }),
  initialState: { visits: 0 },
  actions: {
    visited: Store.action(Schema.Void, (state: { readonly visits: number }) => ({
      visits: state.visits + 1,
    })),
  },
  selectors: {
    visits: Store.selector(Schema.Int, (state: { readonly visits: number }) => state.visits),
  },
}) {}

const Restless = VisitsStore.with(
  compose(
    Effect.fnUntraced(function* () {
      const store = yield* VisitsStore

      yield* store.commands.visited()

      return { name: Reactive.map(store.select.visits, String) }
    }),
  )(TeaView),
)

const RestlessShelf = compose(
  Effect.fnUntraced(function* () {
    return {
      page: yield* Router.outlet({ routes: [Router.on(home, Restless)], otherwise: NothingView }),
    }
  }),
)(ShelfView)

describe("a server render of a routed page whose data arrives at once", () => {
  it.live("draws the data, not the moment before it", () =>
    Effect.gen(function* () {
      const html = yield* Server.renderToString(Shelf, {
        layer: Layer.merge(
          Layer.provideMerge(TeaQuery.live, Router.Router.layerMemory("/")),
          Renderer.html,
        ),
      })

      expect(html).toContain('<output aria-label="Tea">green tea</output>')
    }),
  )

  it.live("still ends when a page changes its own store every time it is drawn", () =>
    Effect.gen(function* () {
      const html = yield* Server.renderToString(RestlessShelf, {
        layer: Layer.merge(Router.Router.layerMemory("/"), Renderer.html),
      })

      expect(html).toContain('<output aria-label="Tea">1</output>')
    }),
  )
})
