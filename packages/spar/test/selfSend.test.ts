import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Option, Ref, Schema, SubscriptionRef } from "effect"
import { Query, Reactive, Store, Timeline } from "spar"

const State = Schema.Struct({ waiting: Schema.Int, sent: Schema.Int })

type State = typeof State.Type

class SendStore extends Store.Tag<SendStore>()("test/SendStore", {
  state: State,
  initialState: { waiting: 3, sent: 0 },
  actions: {
    woke: Store.action(Schema.Void, (state: State): State => state),
    sentOne: Store.action(Schema.Void, (state: State): State => ({
      waiting: state.waiting - 1,
      sent: state.sent + 1,
    })),
  },
  selectors: {},
}) {}

const sendsTheNext = (_payload: void, state: State, send: Store.Send<State>) =>
  state.waiting === 0
    ? Effect.void
    : Effect.gen(function* () {
        yield* Effect.yieldNow
        yield* send(SendStore.actions.sentOne, undefined)
        yield* send(SendStore.actions.woke, undefined)
      })

const recording = (noted: Ref.Ref<ReadonlyArray<Timeline.Noted>>) =>
  Layer.succeed(
    Timeline.Recorder,
    Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
  )

const noticedIn = (noted: Ref.Ref<ReadonlyArray<Timeline.Noted>>) =>
  Effect.map(Ref.get(noted), (all) =>
    all.filter((seen) => seen.kind === "noticed").map((seen) => seen.name),
  )

const drained = Effect.fnUntraced(function* (reaction: Store.Reaction<State>) {
  const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
  const built = yield* Layer.build(
    SendStore.layer([reaction]).pipe(Layer.provideMerge(recording(noted))),
  )
  const store = Context.get(built, SendStore)

  yield* store.commands.woke()
  yield* Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, { discard: true })

  return { state: yield* store.state.get, notices: yield* noticedIn(noted) }
})

describe("a reaction that sends its own action again", () => {
  it.effect("runs to the end and is not reported, as a plain reaction", () =>
    Effect.gen(function* () {
      expect(yield* drained(Store.after(SendStore.actions.woke, sendsTheNext))).toEqual({
        state: { waiting: 0, sent: 3 },
        notices: [],
      })
    }),
  )

  it.effect("runs to the end when it keeps only its latest run: it does not stop itself", () =>
    Effect.gen(function* () {
      expect(yield* drained(Store.afterLatest(SendStore.actions.woke, sendsTheNext))).toEqual({
        state: { waiting: 0, sent: 3 },
        notices: [],
      })
    }),
  )

  it.effect("a reaction that is Spar's own is not reported when its action is sent twice", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const built = yield* Layer.build(
        SendStore.layer([
          Store.unwatched(Store.after(SendStore.actions.woke, () => Effect.never)),
        ]).pipe(Layer.provideMerge(recording(noted))),
      )
      const store = Context.get(built, SendStore)

      yield* store.commands.woke()
      yield* store.commands.woke()
      expect(yield* noticedIn(noted)).toEqual([])
    }),
  )
})

class Slow extends Context.Service<Slow, Readonly<Record<string, Deferred.Deferred<void>>>>()(
  "test/SlowSearch",
) {
  static readonly layer = Layer.effect(
    Slow,
    Effect.all({ a: Deferred.make<void>(), ada: Deferred.make<void>() }),
  )
}

class SearchQuery extends Query.Tag<SearchQuery>()("test/Search", {
  input: Schema.String,
  success: Schema.String,
  failure: Schema.Never,
  load: (text: string) =>
    Effect.flatMap(Effect.service(Slow), (slow) =>
      Effect.as(Deferred.await(slow[text] ?? Deferred.makeUnsafe<void>()), `found ${text}`),
    ),
}) {}

describe("a query whose earlier request answers after a later one", () => {
  it.effect("refuses the older answer itself, and reports nothing the app could act on", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const text = yield* SubscriptionRef.make("a")
      const built = yield* Layer.build(
        SearchQuery.live.pipe(Layer.provideMerge(Slow.layer), Layer.provideMerge(recording(noted))),
      )
      const slow = Context.get(built, Slow)
      const found = yield* Effect.provide(
        SearchQuery.ask(Reactive.fromSubscriptionRef(text)),
        built,
      )
      const settle = Effect.forEach(Array.from({ length: 10 }), () => Effect.yieldNow, {
        discard: true,
      })

      yield* settle
      yield* SubscriptionRef.set(text, "ada")
      yield* settle
      yield* Effect.forEach(Option.toArray(Option.fromUndefinedOr(slow["ada"])), (gate) =>
        Deferred.succeed(gate, undefined),
      )
      yield* settle
      yield* Effect.forEach(Option.toArray(Option.fromUndefinedOr(slow["a"])), (gate) =>
        Deferred.succeed(gate, undefined),
      )
      yield* settle

      expect(yield* found.value.get).toBe("found ada")
      expect(yield* noticedIn(noted)).toEqual([])
    }),
  )
})
