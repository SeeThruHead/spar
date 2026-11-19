import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Option, Ref, Schema } from "effect"
import { Store, Timeline } from "spar"

const State = Schema.Struct({ term: Schema.String, results: Schema.Array(Schema.String) })

type State = typeof State.Type

class Search extends Store.Tag<Search>()("test/Search", {
  state: State,
  initialState: { term: "", results: [] },
  actions: {
    typed: Store.action(
      Schema.Struct({ term: Schema.String }),
      (state: State, { term }): State => ({ ...state, term }),
    ),
    found: Store.action(
      Schema.Struct({ results: Schema.Array(Schema.String) }),
      (state: State, { results }): State => ({ ...state, results }),
    ),
  },
  selectors: {},
}) {}

class Count extends Store.Tag<Count>()("test/Count", {
  state: Schema.Finite,
  initialState: 0,
  actions: {
    asked: Store.action(Schema.Finite, (count: number): number => count),
    set: Store.action(Schema.Finite, (_count: number, to): number => to),
  },
  selectors: {},
}) {}

class Slow extends Context.Service<Slow, Readonly<Record<string, Deferred.Deferred<void>>>>()(
  "test/Slow",
) {
  static readonly layer = Layer.effect(
    Slow,
    Effect.all({ a: Deferred.make<void>(), ab: Deferred.make<void>() }),
  )
}

const looked = ({ term }: { readonly term: string }, _state: State, send: Store.Send<State>) =>
  Effect.flatMap(Effect.service(Slow), (slow) =>
    Effect.andThen(
      Deferred.await(slow[term] ?? slow["a"] ?? Deferred.makeUnsafe<void>()),
      send(Search.actions.found, { results: [`for ${term}`] }),
    ),
  )

const opened = Effect.fnUntraced(function* (reaction: Store.Reaction<State, Slow>) {
  const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
  const built = yield* Layer.build(
    Search.layer([reaction]).pipe(
      Layer.provideMerge(Slow.layer),
      Layer.provideMerge(
        Layer.succeed(
          Timeline.Recorder,
          Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
        ),
      ),
    ),
  )
  const search = Context.get(built, Search)
  const slow = Context.get(built, Slow)
  const answer = (term: string) =>
    Effect.andThen(
      Effect.forEach(Option.toArray(Option.fromUndefinedOr(slow[term])), (gate) =>
        Deferred.succeed(gate, undefined),
      ),
      Effect.andThen(Effect.yieldNow, Effect.yieldNow),
    )

  yield* search.commands.typed({ term: "a" })
  yield* search.commands.typed({ term: "ab" })
  yield* answer("ab")
  yield* answer("a")

  return {
    results: (yield* search.state.get).results,
    notices: (yield* Ref.get(noted))
      .filter((seen) => seen.kind === "noticed")
      .map((seen) => [seen.name, seen.detail]),
  }
})

describe("an answer to an earlier command that lands after a later one's", () => {
  it.effect("is reported when it changes the same part of the state", () =>
    Effect.gen(function* () {
      const seen = yield* opened(Store.after(Search.actions.typed, looked))

      expect(seen.results).toEqual(["for a"])
      expect(seen.notices).toEqual([
        [
          "test/Search/typed",
          {
            code: "SPAR_OLDER_ANSWER",
            said: "What an earlier test/Search/typed started answered after a later one's, and both changed results.",
            in: "",
            at: "",
          },
        ],
      ])
    }),
  )

  it.effect("cannot happen when the reaction keeps only its latest run", () =>
    Effect.gen(function* () {
      const seen = yield* opened(Store.afterLatest(Search.actions.typed, looked))

      expect(seen.results).toEqual(["for ab"])
      expect(seen.notices).toEqual([])
    }),
  )

  it.effect("is told from a state that is not an object by whether it changed at all", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const gates = yield* Effect.all([Deferred.make<void>(), Deferred.make<void>()])
      const built = yield* Layer.build(
        Count.layer([
          Store.after(Count.actions.asked, (to, _count, send) =>
            Effect.andThen(
              Deferred.await(gates[to] ?? gates[0]),
              send(Count.actions.set, to === 0 ? 7 : 5),
            ),
          ),
        ]).pipe(
          Layer.provideMerge(
            Layer.succeed(
              Timeline.Recorder,
              Option.some((each: Timeline.Noted) => Ref.update(noted, (all) => [...all, each])),
            ),
          ),
        ),
      )
      const count = Context.get(built, Count)

      yield* count.commands.asked(0)
      yield* count.commands.asked(1)
      yield* Deferred.succeed(gates[1], undefined)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      yield* Deferred.succeed(gates[0], undefined)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      yield* count.commands.asked(0)
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(
        (yield* Ref.get(noted)).filter((each) => each.kind === "noticed").map((each) => each.name),
      ).toEqual(["test/Count/asked"])
    }),
  )
})
