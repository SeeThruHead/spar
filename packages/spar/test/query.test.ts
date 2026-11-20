import { describe, expect, it } from "@effect/vitest"
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  MutableRef,
  Option,
  Ref,
  Schedule,
  Schema,
  Scope,
  SubscriptionRef,
  Tracer,
} from "effect"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { Props, Query, Reactive, Store, Timeline, View, compose, withProps } from "spar"
import * as Spans from "spar/devtools/spans"
import * as Testing from "spar/testing"
import { FeedView, OrdersView, ShelfView } from "./units.tsx"

const User = Schema.Struct({ id: Schema.Int, email: Schema.String })

type User = typeof User.Type

type Asked = {
  readonly what: string
  readonly answer: Deferred.Deferred<unknown, string>
}

class Directory extends Context.Service<
  Directory,
  {
    readonly asked: Ref.Ref<ReadonlyArray<Asked>>
    readonly users: Effect.Effect<ReadonlyArray<User>, string>
    readonly stock: Effect.Effect<number, string>
    readonly orders: (userId: number) => Effect.Effect<ReadonlyArray<string>, string>
  }
>()("test/Directory") {
  static readonly layer = Layer.effect(
    Directory,
    Effect.gen(function* () {
      const asked = yield* Ref.make<ReadonlyArray<Asked>>([])
      const waitFor = Effect.fnUntraced(function* <A>(
        what: string,
        schema: Schema.Codec<A, unknown>,
      ) {
        const answer = yield* Deferred.make<unknown, string>()

        yield* Ref.update(asked, (all) => [...all, { what, answer }])

        const given = yield* Deferred.await(answer)

        return yield* Effect.orDie(Schema.decodeUnknownEffect(schema)(given))
      })

      return Directory.of({
        asked,
        users: waitFor("users", Schema.Array(User)),
        stock: waitFor("stock", Schema.Finite),
        orders: (userId) => waitFor(`orders ${userId}`, Schema.Array(Schema.String)),
      })
    }),
  )
}

const directory = Effect.service(Directory)

class Users extends Query.Tag<Users>()("test/Users", {
  input: Schema.Void,
  success: Schema.Array(User),
  failure: Schema.String,
  load: () => Effect.flatMap(directory, (found) => found.users),
  staleAfter: "1 minute",
}) {}

class Stock extends Query.Tag<Stock>()("test/Stock", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Schema.String,
  load: () => Effect.flatMap(directory, (found) => found.stock),
}) {}

class LiveStock extends Query.Tag<LiveStock>()("test/LiveStock", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Schema.String,
  staleAfter: "0 millis",
  load: () => Effect.flatMap(directory, (found) => found.stock),
}) {}

class Orders extends Query.Tag<Orders>()("test/Orders", {
  input: Schema.Int,
  success: Schema.Array(Schema.String),
  failure: Schema.String,
  load: (userId: number) => Effect.flatMap(directory, (found) => found.orders(userId)),
  staleAfter: "1 minute",
}) {}

class Few extends Query.Tag<Few>()("test/Few", {
  input: Schema.Int,
  success: Schema.Array(Schema.String),
  failure: Schema.String,
  load: (userId: number) => Effect.flatMap(directory, (found) => found.orders(userId)),
  staleAfter: "1 minute",
  keepAtMost: 1,
  dropAfter: "1 hour",
}) {}

class Patient extends Query.Tag<Patient>()("test/Patient", {
  input: Schema.Void,
  success: Schema.Finite,
  failure: Schema.String,
  load: () => Effect.flatMap(directory, (found) => found.stock),
  retry: Schedule.recurs(1),
}) {}

const RosterState = Schema.Struct({ renamed: Schema.Int })

type RosterState = typeof RosterState.Type

class Roster extends Store.Tag<Roster>()("test/Roster", {
  state: RosterState,
  initialState: { renamed: 0 },
  actions: {
    renamed: Store.action(Schema.Void, (state: RosterState) => ({ renamed: state.renamed + 1 })),
    restocked: Store.action(
      Schema.Struct({ to: Schema.Finite }),
      (state: RosterState): RosterState => state,
    ),
  },
  selectors: {},
}) {}

const ada: User = { id: 1, email: "ada@example.com" }

const grace: User = { id: 2, email: "grace@example.com" }

const recording = (noted: Ref.Ref<ReadonlyArray<Timeline.Noted>>) =>
  Layer.succeed(
    Timeline.Recorder,
    Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
  )

const opened = Effect.gen(function* () {
  const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
  const built = yield* Layer.build(
    Roster.layer([
      Users.invalidatedBy(Roster.actions.renamed),
      Stock.patchedBy(
        Roster.actions.restocked,
        () => undefined,
        (_stock, { to }) => to,
      ),
    ]).pipe(
      Layer.provideMerge(Layer.mergeAll(Users.live, Stock.live, Orders.live, Few.live)),
      Layer.provideMerge(Directory.layer),
      Layer.provideMerge(Layer.merge(SecureRandom.layerWebCrypto, recording(noted))),
    ),
  )
  const found = yield* Effect.provide(directory, built)
  const whats = Effect.map(Ref.get(found.asked), (asked) => asked.map((each) => each.what))
  const settle = (what: string, exit: (waiting: Asked) => Effect.Effect<boolean>) =>
    Effect.flatMap(Ref.get(found.asked), (asked) =>
      Effect.andThen(
        Effect.forEach(asked.filter((each) => each.what === what).slice(-1), exit),
        Effect.yieldNow,
      ),
    )

  return {
    built,
    noted,
    whats,
    users: yield* Effect.provide(Effect.service(Users), built),
    roster: yield* Effect.provide(Effect.service(Roster), built),
    answer: (what: string, value: unknown) =>
      settle(what, (waiting) => Deferred.succeed(waiting.answer, value)),
    refuse: (what: string, reason: string) =>
      settle(what, (waiting) => Deferred.fail(waiting.answer, reason)),
  }
})

const readings = <A, E>(handle: Query.Handle<A, E>) =>
  Effect.all([handle.status.get, handle.value.get, handle.error.get, handle.loading.get])

const feedSays = (label: string) =>
  document.querySelector(`[aria-label="Feed ${label}"]`)?.textContent

const shows = (items: string, state: string, more: string) =>
  Testing.eventually(() =>
    expect([feedSays("items"), feedSays("state"), feedSays("more")]).toEqual([items, state, more]),
  )

const hidden = (state: string) =>
  Effect.sync(() => {
    Object.defineProperty(document, "visibilityState", { value: state, configurable: true })
    document.dispatchEvent(new Event("visibilitychange"))
  })

const connection = (type: string) => Effect.sync(() => window.dispatchEvent(new Event(type)))

describe("the natural way: a value from one place feeds a query declared in another", () => {
  it.effect(
    "what waits for nothing starts at once, and a dependent query waits only for its input",
    () =>
      Effect.gen(function* () {
        const { built, noted, whats, answer } = yield* opened
        const declared = yield* Effect.provide(
          Effect.gen(function* () {
            const users = yield* Users.ask()
            const stock = yield* Stock.ask()
            const firstUser = Reactive.map(users.value, (loaded) =>
              Option.fromNullishOr(loaded?.[0]?.id),
            )
            const orders = yield* Orders.ask(firstUser)

            return { users, stock, orders }
          }),
          built,
        )

        yield* Effect.yieldNow
        expect(yield* whats).toEqual(["users", "stock"])
        expect(yield* readings(declared.orders)).toEqual(["waiting", null, null, false])

        yield* answer("stock", 40)
        expect(yield* declared.stock.value.get).toBe(40)
        expect(yield* whats).toEqual(["users", "stock"])
        expect(yield* declared.orders.status.get).toBe("waiting")

        yield* answer("users", [ada, grace])
        yield* Effect.yieldNow
        expect(yield* whats).toEqual(["users", "stock", "orders 1"])
        expect(yield* readings(declared.orders)).toEqual(["loading", null, null, true])

        yield* answer("orders 1", ["tea", "ink"])
        expect(yield* readings(declared.orders)).toEqual(["loaded", ["tea", "ink"], null, false])
        expect(
          (yield* Ref.get(noted))
            .filter((seen) => seen.kind === "command")
            .map((seen) => seen.name),
        ).toEqual([
          "test/Users/requested",
          "test/Stock/requested",
          "test/Stock/loaded",
          "test/Users/loaded",
          "test/Orders/requested",
          "test/Orders/loaded",
        ])
      }),
  )

  it.effect(
    "another store's command can change what a query holds at once, before the server is asked",
    () =>
      Effect.gen(function* () {
        const { built, whats, answer, roster } = yield* opened
        const stock = yield* Effect.provide(Stock.ask(), built)

        yield* Effect.yieldNow
        yield* roster.commands.restocked({ to: 9 })
        yield* Effect.yieldNow
        expect(yield* readings(stock)).toEqual(["loading", null, null, true])

        yield* answer("stock", 3)
        yield* roster.commands.restocked({ to: 9 })
        yield* Effect.yieldNow
        expect(yield* readings(stock)).toEqual(["loaded", 9, null, false])
        expect(yield* whats).toEqual(["stock"])
      }),
  )

  it.effect("while another input loads, the last value that was loaded can still be shown", () =>
    Effect.gen(function* () {
      const { built, answer } = yield* opened
      const page = yield* SubscriptionRef.make(1)
      const orders = yield* Effect.provide(Orders.ask(Reactive.fromSubscriptionRef(page)), built)

      yield* Effect.yieldNow
      expect(yield* orders.latest.get).toBeNull()
      yield* answer("orders 1", ["tea"])
      yield* SubscriptionRef.set(page, 2)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect([yield* orders.value.get, yield* orders.latest.get]).toEqual([null, ["tea"]])

      yield* answer("orders 2", ["ink"])
      expect([yield* orders.value.get, yield* orders.latest.get]).toEqual([["ink"], ["ink"]])
    }),
  )

  it.effect("a new input is a new entry in the cache, and going back to one is a cache hit", () =>
    Effect.gen(function* () {
      const { built, whats, answer } = yield* opened
      const selected = yield* SubscriptionRef.make(1)
      const orders = yield* Effect.provide(
        Orders.ask(Reactive.fromSubscriptionRef(selected)),
        built,
      )

      yield* Effect.yieldNow
      yield* answer("orders 1", ["tea"])
      yield* SubscriptionRef.set(selected, 2)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["orders 1", "orders 2"])
      expect(yield* readings(orders)).toEqual(["loading", null, null, true])

      yield* answer("orders 2", ["ink"])
      expect(yield* orders.value.get).toEqual(["ink"])

      yield* SubscriptionRef.set(selected, 1)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["orders 1", "orders 2"])
      expect(yield* readings(orders)).toEqual(["loaded", ["tea"], null, false])
      expect(yield* Effect.provide(Orders.read(2), built)).toEqual(["ink"])
      expect(yield* Effect.provide(Orders.read(99), built)).toBeNull()
    }),
  )

  it.effect("a plain value is an input too, and two declarations of it share one request", () =>
    Effect.gen(function* () {
      const { built, whats, answer } = yield* opened
      const first = yield* Effect.provide(Orders.ask(7), built)
      const second = yield* Effect.provide(Orders.ask(7), built)

      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["orders 7"])
      expect(yield* first.status.get).toBe("loading")
      yield* answer("orders 7", ["pen"])
      expect([yield* first.value.get, yield* second.value.get]).toEqual([["pen"], ["pen"]])
    }),
  )

  it.live("a list read a page at a time: the pages so far, whether there is more, and more", () =>
    Effect.gen(function* () {
      const Feed = compose(
        Effect.fnUntraced(function* () {
          const feed = yield* Orders.pages({
            first: 1,
            next: (_page, input) => (input < 3 ? Option.some(input + 1) : Option.none()),
          })
          const state = yield* Reactive.zip(feed.loading, feed.failed)

          return {
            items: Reactive.map(feed.pages, (all) => all.flat().join(",")),
            state: Reactive.map(state, ([loading, failed]) => `${loading} ${failed}`),
            more: Reactive.map(feed.more, String),
            onMore: feed.loadMore,
          }
        }),
      )(FeedView)
      const found = yield* directory
      const answered = (count: number, exit: (waiting: Asked) => Effect.Effect<boolean>) =>
        Effect.flatMap(
          Effect.repeat(Ref.get(found.asked), {
            until: (all) => all.length === count,
            schedule: Schedule.spaced("5 millis"),
          }),
          (all) => Effect.forEach(all.slice(-1), exit),
        )
      yield* Testing.mount(Feed)
      yield* shows("", "true false", "false")
      yield* Testing.click("button", "More")
      yield* answered(1, (waiting) => Deferred.succeed(waiting.answer, ["a", "b"]))
      yield* shows("a,b", "false false", "true")

      yield* Testing.click("button", "More")
      yield* shows("a,b", "true false", "false")
      yield* answered(2, (waiting) => Deferred.succeed(waiting.answer, ["c"]))
      yield* shows("a,b,c", "false false", "true")

      yield* Testing.click("button", "More")
      yield* answered(3, (waiting) => Deferred.fail(waiting.answer, "down"))
      yield* shows("a,b,c", "false true", "false")
      yield* Testing.click("button", "More")
      expect((yield* Ref.get(found.asked)).map((each) => each.what)).toEqual([
        "orders 1",
        "orders 2",
        "orders 3",
      ])
    }).pipe(
      Effect.provide(
        Orders.live.pipe(
          Layer.provideMerge(Directory.layer),
          Layer.provide(SecureRandom.layerWebCrypto),
        ),
      ),
    ),
  )

  it.live("a list whose next page is one it already has says there is no more", () =>
    Effect.gen(function* () {
      const Feed = compose(
        Effect.fnUntraced(function* () {
          const feed = yield* Orders.pages({ first: 1, next: () => Option.some(1) })

          return {
            items: Reactive.map(feed.pages, (all) => all.flat().join(",")),
            state: Reactive.map(feed.loading, String),
            more: Reactive.map(feed.more, String),
            onMore: feed.loadMore,
          }
        }),
      )(FeedView)
      const found = yield* directory

      yield* Testing.mount(Feed)
      yield* shows("", "true", "false")

      const asked = yield* Effect.repeat(Ref.get(found.asked), {
        until: (all) => all.length === 1,
        schedule: Schedule.spaced("5 millis"),
      })

      yield* Effect.forEach(asked, (waiting) => Deferred.succeed(waiting.answer, ["a"]))
      yield* shows("a", "false", "false")
      yield* Testing.click("button", "More")
      yield* Effect.sleep("20 millis")
      yield* shows("a", "false", "false")
      expect((yield* Ref.get(found.asked)).map((each) => each.what)).toEqual(["orders 1"])
    }).pipe(
      Effect.provide(
        Orders.live.pipe(
          Layer.provideMerge(Directory.layer),
          Layer.provide(SecureRandom.layerWebCrypto),
        ),
      ),
    ),
  )

  it.live("in components: the parent passes a prop, the child declares its query with it", () =>
    Effect.gen(function* () {
      const OrdersOf = compose(
        withProps({ userId: Props.Reactive(Schema.Int) }),
        Effect.fnUntraced(function* ({ userId }) {
          const orders = yield* Orders.ask(userId)

          return {
            status: orders.status,
            count: Reactive.map(orders.value, (loaded) => loaded?.length ?? 0),
          }
        }),
      )(OrdersView)
      const selected = yield* SubscriptionRef.make(1)
      const Shelf = compose(
        Effect.fnUntraced(function* () {
          return {
            orders: yield* View.child(OrdersOf, {
              userId: Reactive.fromSubscriptionRef(selected),
            }),
          }
        }),
      )(ShelfView)

      yield* Testing.mount(Shelf)
      yield* Testing.eventually(() =>
        expect(document.querySelector('[aria-label="Orders status"]')?.textContent).toBe("loading"),
      )

      const found = yield* directory
      const asked = yield* Effect.repeat(Ref.get(found.asked), {
        until: (all) => all.length === 1,
        schedule: Schedule.spaced("5 millis"),
      })

      expect(asked.map((each) => each.what)).toEqual(["orders 1"])
      yield* Effect.forEach(asked, (waiting) => Deferred.succeed(waiting.answer, ["tea", "ink"]))
      yield* Testing.eventually(() =>
        expect(document.querySelector('[aria-label="Orders count"]')?.textContent).toBe("2"),
      )
    }).pipe(
      Effect.provide(
        Orders.live.pipe(
          Layer.provideMerge(Directory.layer),
          Layer.provide(SecureRandom.layerWebCrypto),
        ),
      ),
    ),
  )
})

describe("server data in a store", () => {
  it.effect("loads when asked for, once, and is loading, then loaded, as typed states", () =>
    Effect.gen(function* () {
      const { built, noted, users, whats, answer } = yield* opened
      const shown = yield* Effect.provide(Users.ask(), built)

      yield* Effect.provide(Users.ask(), built)
      yield* Effect.yieldNow
      expect(yield* readings(shown)).toEqual(["loading", null, null, true])
      expect(yield* whats).toEqual(["users"])

      yield* TestClock.adjust("5 seconds")
      yield* answer("users", [ada])

      expect(yield* readings(shown)).toEqual(["loaded", [ada], null, false])
      expect(Object.values(yield* users.select.entries.get)).toEqual([
        {
          status: "loaded",
          value: [ada],
          error: null,
          loadedAt: 5000,
          request: 1,
          input: null,
          traceId: "",
          spanId: "",
          unusedSince: null,
        },
      ])
      expect((yield* Ref.get(noted)).map((seen) => [seen.kind, seen.name])).toEqual([
        ["command", "test/Users/requested"],
        ["data", "test/Users/served"],
        ["command", "test/Users/loaded"],
      ])
    }),
  )

  it.effect("asking again while it loads is refused and seen, not sent twice", () =>
    Effect.gen(function* () {
      const { built, noted, users, whats } = yield* opened
      const shown = yield* Effect.provide(Users.ask(), built)

      yield* shown.refetch
      yield* Effect.yieldNow

      expect(yield* whats).toEqual(["users"])
      expect(Option.map(yield* users.refused.get, (refusal) => refusal.reason)).toEqual(
        Option.some("[SPAR_ALREADY_LOADING] It is already loading"),
      )
      expect((yield* Ref.get(noted)).map((seen) => seen.kind)).toEqual(["command", "refused"])
    }),
  )

  it.effect("stays fresh for its stale time, counted from when it loaded", () =>
    Effect.gen(function* () {
      const { built, users, whats, answer } = yield* opened

      yield* TestClock.adjust("5 seconds")
      yield* Effect.provide(Users.ask(), built)
      yield* Effect.yieldNow
      yield* answer("users", [ada])
      yield* TestClock.adjust("1 minute")
      yield* Effect.provide(Users.ask(), built)
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["users"])

      yield* TestClock.adjust("1 second")

      const later = yield* Effect.provide(Users.ask(), built)

      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["users", "users"])
      expect(yield* readings(later)).toEqual(["loading", [ada], null, true])
      expect(Object.values(yield* users.select.entries.get).map((held) => held.loadedAt)).toEqual([
        5000,
      ])
      yield* answer("users", [ada, grace])
      expect(yield* later.value.get).toEqual([ada, grace])
    }),
  )

  it.effect("what was invalidated, or failed after it had loaded, is asked for again", () =>
    Effect.gen(function* () {
      const { built, users, whats, answer, refuse } = yield* opened

      yield* Effect.provide(Users.ask(), built)
      yield* Effect.yieldNow
      yield* answer("users", [ada])
      yield* users.commands.invalidated()
      yield* Effect.provide(Users.ask(), built)
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["users", "users"])

      yield* refuse("users", "gone")
      yield* Effect.provide(Users.ask(), built)
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["users", "users", "users"])
    }),
  )

  it.effect(
    "everything a query does is marked as data in the trace, with where its input came from",
    () =>
      Effect.gen(function* () {
        const { built, answer } = yield* opened
        const spans = yield* Layer.build(Spans.layer())
        const buffer = Context.get(spans, Spans.SpanBuffer)

        yield* Effect.provide(Effect.provide(Users.ask(), built), spans)
        yield* Effect.yieldNow
        yield* answer("users", [ada])

        const recorded = buffer.recent().filter((span) => span.name.startsWith("test/Users/"))

        expect(recorded.map((span) => [span.name, span.attributes["spar.kind"]])).toEqual([
          ["test/Users/requested", "data"],
          ["test/Users/loaded", "data"],
        ])
        expect(recorded[0]?.attributes["spar.query.after"]).toBe("")
      }),
  )

  it.effect(
    "data already there is served with a short span that points at the trace that loaded it",
    () =>
      Effect.gen(function* () {
        const { built, noted, answer } = yield* opened
        const spans = yield* Layer.build(Spans.layer())
        const buffer = Context.get(spans, Spans.SpanBuffer)
        const asking = (during: string) =>
          Effect.provide(Effect.withSpan(Effect.provide(Users.ask(), built), during), spans)

        yield* asking("pointing at the link")
        yield* Effect.yieldNow
        yield* answer("users", [ada])
        yield* asking("the click")

        const named = (name: string) => buffer.recent().filter((span) => span.name === name)
        const [preload] = named("pointing at the link")
        const [click] = named("the click")
        const [served] = named("test/Users/served")

        expect(preload?.traceId).not.toBe(click?.traceId)
        expect(served?.traceId).toBe(click?.traceId)
        expect(served?.attributes).toMatchObject({
          "spar.kind": "data",
          "spar.query.served_from": preload?.traceId,
        })
        expect((yield* Ref.get(noted)).findLast((seen) => seen.kind === "data")?.detail).toEqual({
          key: "null",
          from: preload?.traceId,
        })
      }),
  )

  it.effect(
    "the served span links to the span that loaded the data, and to nothing when no span did",
    () =>
      Effect.gen(function* () {
        const { built, answer } = yield* opened
        const inner = yield* Effect.tracer
        const made = MutableRef.make<ReadonlyArray<Tracer.Span>>([])
        const watching = Tracer.make({
          span: (options) => {
            const span = inner.span(options)

            MutableRef.update(made, (all) => [...all, span])

            return span
          },
        })
        const during = <A, E, R>(name: string, effect: Effect.Effect<A, E, R>) =>
          Effect.withTracer(Effect.withSpan(Effect.provide(effect, built), name), watching)
        const linksOf = (name: string) =>
          MutableRef.get(made)
            .findLast((span) => span.name === name)
            ?.links.map((link) => [link.span.traceId, link.span.spanId, link.span.sampled])

        yield* during("first", Users.ask())
        yield* Effect.yieldNow
        yield* answer("users", [ada])
        yield* during("second", Users.ask())

        const first = MutableRef.get(made).find((span) => span.name === "first")

        expect(linksOf("test/Users/served")).toEqual([[first?.traceId, first?.spanId, true]])

        yield* Effect.provide(Orders.ask(5), built)
        yield* Effect.yieldNow
        yield* answer("orders 5", ["tea"])
        yield* during("third", Orders.ask(5))
        expect(linksOf("test/Orders/served")).toEqual([])
      }),
  )

  it.effect("data nobody is using is released, and dropped after a while", () =>
    Effect.gen(function* () {
      const { built, noted, answer } = yield* opened
      const orders = yield* Effect.provide(Effect.service(Orders), built)
      const keys = Effect.map(orders.state.get, (now) => Object.keys(now.entries))
      const said = Effect.map(Ref.get(noted), (all) =>
        all.filter((seen) => seen.kind !== "data").map((seen) => seen.name.split("/").at(-1)),
      )

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* Effect.provide(Orders.ask(1), built)
          yield* Effect.provide(Orders.ask(1), built)
          yield* Effect.yieldNow
          yield* answer("orders 1", ["tea"])
        }),
      )
      yield* Effect.yieldNow
      expect(yield* keys).toEqual(["1"])
      expect(yield* said).toEqual(["requested", "loaded", "released"])

      yield* TestClock.adjust("5 minutes")
      expect(yield* keys).toEqual([])
      expect(yield* said).toEqual(["requested", "loaded", "released", "dropped"])
    }),
  )

  it.effect("the wait before a drop does not hold on to the trace it was released in", () =>
    Effect.gen(function* () {
      const { built, answer } = yield* opened
      const orders = yield* Effect.provide(Effect.service(Orders), built)
      const spans = yield* Layer.build(Spans.layer())
      const buffer = Context.get(spans, Spans.SpanBuffer)

      yield* Effect.provide(
        Effect.withSpan(
          Effect.scoped(
            Effect.gen(function* () {
              yield* Effect.provide(Orders.ask(4), built)
              yield* Effect.yieldNow
              yield* answer("orders 4", ["tea"])
            }),
          ),
          "the page that was left",
        ),
        spans,
      )
      yield* Effect.yieldNow
      yield* TestClock.adjust("5 minutes")

      const named = (name: string) => buffer.recent().filter((span) => span.name === name)
      const [page] = named("the page that was left")
      const [released] = named("test/Orders/released")

      expect(released?.traceId).toBe(page?.traceId)
      expect(named("test/Orders/dropped")).toEqual([])
      expect(Object.keys((yield* orders.state.get).entries)).toEqual([])
    }),
  )

  it.effect("data that is asked for again before it is dropped is kept", () =>
    Effect.gen(function* () {
      const { built, noted, answer } = yield* opened
      const orders = yield* Effect.provide(Effect.service(Orders), built)
      const selected = yield* SubscriptionRef.make(1)

      yield* Effect.scoped(Effect.provide(Orders.ask(1), built))
      yield* Effect.yieldNow
      yield* answer("orders 1", ["tea"])
      yield* TestClock.adjust("1 minute")
      yield* Effect.provide(Orders.ask(Reactive.fromSubscriptionRef(selected)), built)
      yield* TestClock.adjust("5 minutes")
      expect(Object.keys((yield* orders.state.get).entries)).toEqual(["1"])
      expect(Option.map(yield* orders.refused.get, (refusal) => refusal.reason)).toEqual(
        Option.some("[SPAR_IN_USE_AGAIN] It is in use again"),
      )
      expect(
        (yield* Ref.get(noted)).filter((seen) => seen.name === "test/Orders/held").length,
      ).toBe(1)

      yield* SubscriptionRef.set(selected, 2)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(
        Object.values((yield* orders.state.get).entries).map((entry) => entry.unusedSince === null),
      ).toEqual([false, true])
    }),
  )

  it.effect("over its size, a cache drops what has been unused the longest at once", () =>
    Effect.gen(function* () {
      const { built, answer } = yield* opened
      const few = yield* Effect.provide(Effect.service(Few), built)
      const once = (id: number) =>
        Effect.andThen(
          Effect.scoped(
            Effect.andThen(
              Effect.andThen(Effect.provide(Few.ask(id), built), Effect.yieldNow),
              answer(`orders ${id}`, ["x"]),
            ),
          ),
          Effect.andThen(TestClock.adjust("1 second"), Effect.yieldNow),
        )

      yield* once(1)
      yield* once(2)
      expect(Object.keys((yield* few.state.get).entries)).toEqual(["2"])
      yield* once(3)
      expect(Object.keys((yield* few.state.get).entries)).toEqual(["3"])

      const early = yield* Scope.make()

      yield* Effect.provideService(Effect.provide(Few.ask(7), built), Scope.Scope, early)
      yield* Effect.yieldNow
      yield* answer("orders 7", ["x"])
      yield* once(8)
      expect(Object.keys((yield* few.state.get).entries)).toEqual(["7"])
      yield* once(6)
      yield* TestClock.adjust("1 second")
      yield* Scope.close(early, Exit.void)
      yield* Effect.yieldNow
      expect(Object.keys((yield* few.state.get).entries)).toEqual(["7"])

      yield* Effect.provide(Few.ask(9), built)
      yield* Effect.yieldNow
      yield* answer("orders 9", ["x"])
      yield* once(4)
      expect(Object.keys((yield* few.state.get).entries)).toEqual(["9"])
    }),
  )

  it.effect("an input that is set again to what it already was is not looked at again", () =>
    Effect.gen(function* () {
      const { built, noted, answer } = yield* opened
      const selected = yield* SubscriptionRef.make(1)
      const served = Effect.map(
        Ref.get(noted),
        (all) => all.filter((seen) => seen.name === "test/Orders/served").length,
      )

      yield* Effect.provide(Orders.ask(Reactive.fromSubscriptionRef(selected)), built)
      yield* Effect.yieldNow
      yield* answer("orders 1", ["tea"])
      yield* SubscriptionRef.set(selected, 1)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* served).toBe(0)
    }),
  )

  it.effect("what is asked for again by hand or by invalidation forgets which span loaded it", () =>
    Effect.gen(function* () {
      const { built, users, answer } = yield* opened
      const loadedBy = Effect.map(users.state.get, (now) =>
        Object.values(now.entries).map((entry) => [entry.traceId === "", entry.spanId === ""]),
      )
      const spans = yield* Layer.build(Spans.layer())
      const handle = yield* Effect.provide(
        Effect.withSpan(Effect.provide(Users.ask(), built), "the first ask"),
        spans,
      )

      yield* Effect.yieldNow
      yield* answer("users", [ada])
      expect(yield* loadedBy).toEqual([[false, false]])

      yield* handle.refetch
      yield* Effect.yieldNow
      expect(yield* loadedBy).toEqual([[true, true]])
      yield* answer("users", [ada])

      yield* Effect.provide(
        Effect.withSpan(Effect.provide(Users.ask(), built), "asked again"),
        spans,
      )
      yield* Effect.provide(Users.invalidate, built)
      yield* Effect.yieldNow
      expect(yield* loadedBy).toEqual([[true, true]])
    }),
  )

  it.live(
    "coming back to the tab or back online asks again for what has gone stale, and only that",
    () =>
      Effect.gen(function* () {
        const { built, whats, answer } = yield* opened
        const live = yield* Layer.build(Layer.provide(LiveStock.live, Layer.succeedContext(built)))
        const asked = (count: number) =>
          Effect.repeat(whats, {
            until: (all) => all.length === count,
            schedule: Schedule.spaced("5 millis"),
          })

        yield* Effect.provide(LiveStock.ask(), live)
        yield* Effect.provide(Users.ask(), built)
        yield* asked(2)
        yield* answer("stock", 3)
        yield* answer("users", [ada])
        yield* Effect.sleep("10 millis")

        yield* hidden("hidden")
        yield* Effect.sleep("20 millis")
        expect(yield* whats).toEqual(["stock", "users"])

        yield* hidden("visible")
        expect(yield* asked(3)).toEqual(["stock", "users", "stock"])
        yield* answer("stock", 4)
        yield* Effect.sleep("10 millis")

        yield* connection("offline")
        yield* connection("online")
        expect(yield* asked(4)).toEqual(["stock", "users", "stock", "stock"])
      }),
  )

  it.effect("a query given a schedule tries again by itself before it calls it a failure", () =>
    Effect.gen(function* () {
      const { built, whats, refuse, answer } = yield* opened
      const patient = yield* Layer.build(Layer.provide(Patient.live, Layer.succeedContext(built)))
      const shown = yield* Effect.provide(Patient.ask(), patient)

      yield* Effect.yieldNow
      yield* refuse("stock", "busy")
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["stock", "stock"])
      expect(yield* shown.status.get).toBe("loading")
      yield* answer("stock", 9)
      expect(yield* readings(shown)).toEqual(["loaded", 9, null, false])
    }),
  )

  it.effect("by default an answer stays fresh for 500 ms: asks 100 ms apart share one call", () =>
    Effect.gen(function* () {
      const { built, whats, answer } = yield* opened

      yield* Effect.provide(Stock.ask(), built)
      yield* Effect.yieldNow
      yield* answer("stock", 3)
      yield* TestClock.adjust("100 millis")
      yield* Effect.provide(Stock.ask(), built)
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["stock"])
      yield* TestClock.adjust("500 millis")
      yield* Effect.provide(Stock.ask(), built)
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["stock", "stock"])
    }),
  )

  it.effect("with a stale time of 0 it is stale as soon as time has passed", () =>
    Effect.gen(function* () {
      const { built, whats, answer } = yield* opened
      const live = yield* Layer.build(Layer.provide(LiveStock.live, Layer.succeedContext(built)))

      yield* Effect.provide(LiveStock.ask(), live)
      yield* Effect.yieldNow
      yield* answer("stock", 3)
      yield* Effect.provide(LiveStock.ask(), live)
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["stock"])
      yield* TestClock.adjust("1 milli")
      yield* Effect.provide(LiveStock.ask(), live)
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["stock", "stock"])
    }),
  )

  it.effect("a failure is a typed state, and the next need tries again", () =>
    Effect.gen(function* () {
      const { built, whats, refuse, answer } = yield* opened
      const shown = yield* Effect.provide(Users.ask(), built)

      yield* Effect.yieldNow
      yield* refuse("users", "The directory is down")
      expect(yield* readings(shown)).toEqual(["failed", null, "The directory is down", false])

      yield* Effect.provide(Users.ask(), built)
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["users", "users"])
      expect(yield* readings(shown)).toEqual(["loading", null, "The directory is down", true])
      yield* answer("users", [grace])
      expect(yield* readings(shown)).toEqual(["loaded", [grace], null, false])
    }),
  )

  it.effect("an answer to an earlier request, or to nothing that was asked, is refused", () =>
    Effect.gen(function* () {
      const { built, users } = yield* opened
      const shown = yield* Effect.provide(Users.ask(), built)
      const [key] = Object.keys((yield* users.state.get).entries)

      yield* users.commands.loaded({ key: key ?? "", request: 0, value: [grace], at: 1 })
      expect(yield* shown.status.get).toBe("loading")
      yield* users.commands.failed({ key: "nothing asked this", request: 1, error: "late" })
      expect(yield* shown.status.get).toBe("loading")
      expect(Option.map(yield* users.refused.get, (refusal) => refusal.reason)).toEqual(
        Option.some("[SPAR_LATE_ANSWER] This answers an earlier request"),
      )
    }),
  )

  it.effect("a command in another store invalidates it, and it loads again at once", () =>
    Effect.gen(function* () {
      const { built, roster, whats, answer } = yield* opened
      const shown = yield* Effect.provide(Users.ask(), built)

      yield* Effect.yieldNow
      yield* answer("users", [ada])
      yield* roster.commands.renamed()
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* whats).toEqual(["users", "users"])
      expect(yield* readings(shown)).toEqual(["loading", [ada], null, true])

      yield* answer("users", [grace])
      expect(yield* shown.value.get).toEqual([grace])
    }),
  )

  it.live("can sit beside the view that shows it, with no layer of its own at the root", () =>
    Effect.gen(function* () {
      const Shown = Stock.beside(
        compose(
          Effect.fnUntraced(function* () {
            const stock = yield* Stock.ask()

            return {
              status: stock.status,
              count: Reactive.map(stock.value, (loaded) => loaded ?? 0),
            }
          }),
        )(OrdersView),
      )

      yield* Testing.mount(Shown)

      const found = yield* directory
      const asked = yield* Effect.repeat(Ref.get(found.asked), {
        until: (all) => all.length === 1,
        schedule: Schedule.spaced("5 millis"),
      })

      yield* Effect.forEach(asked, (waiting) => Deferred.succeed(waiting.answer, 12))
      yield* Testing.eventually(() =>
        expect(document.querySelector('[aria-label="Orders count"]')?.textContent).toBe("12"),
      )
    }).pipe(Effect.provide(Directory.layer)),
  )

  it("its states and a refusal are plain data with a Schema", () => {
    expect(
      ["waiting", "loading", "loaded", "failed", "other"].map(Schema.is(Query.Status)),
    ).toEqual([true, true, true, true, false])
    expect(
      Schema.is(Store.Refusal)({
        action: "requested",
        reason: "[SPAR_ALREADY_LOADING] It is already loading",
        payload: null,
      }),
    ).toBe(true)
    expect(Schema.is(Store.Refusal)({ action: "requested" })).toBe(false)
  })
})
