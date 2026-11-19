import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Option, Ref, Schedule, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { Query, Reactive, Store, Timeline, View } from "spar"
import * as Testing from "spar/testing"
import { TallyView } from "./units.tsx"

const User = Schema.Struct({ id: Schema.Int, email: Schema.String })

type User = typeof User.Type

type Asked = Deferred.Deferred<ReadonlyArray<User>, string>

class Directory extends Context.Service<
  Directory,
  {
    readonly asked: Ref.Ref<ReadonlyArray<Asked>>
    readonly list: Effect.Effect<ReadonlyArray<User>, string>
  }
>()("test/Directory") {
  static readonly layer = Layer.effect(
    Directory,
    Effect.gen(function* () {
      const asked = yield* Ref.make<ReadonlyArray<Asked>>([])

      return Directory.of({
        asked,
        list: Effect.gen(function* () {
          const answer = yield* Deferred.make<ReadonlyArray<User>, string>()

          yield* Ref.update(asked, (all) => [...all, answer])

          return yield* Deferred.await(answer)
        }),
      })
    }),
  )
}

class Users extends Query.Tag<Users>()("test/Users", {
  success: Schema.Array(User),
  failure: Schema.String,
  load: Effect.flatMap(Effect.service(Directory), (directory) => directory.list),
  staleAfter: "1 minute",
}) {}

class Always extends Query.Tag<Always>()("test/Always", {
  success: Schema.Array(User),
  failure: Schema.String,
  load: Effect.flatMap(Effect.service(Directory), (directory) => directory.list),
}) {}

const RosterState = Schema.Struct({ renamed: Schema.Int })

type RosterState = typeof RosterState.Type

class Roster extends Store.Tag<Roster>()("test/Roster", {
  state: RosterState,
  initialState: { renamed: 0 },
  actions: {
    renamed: Store.action(Schema.Void, (state: RosterState) => ({ renamed: state.renamed + 1 })),
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
    Roster.layer([Users.invalidatedBy(Roster.actions.renamed)]).pipe(
      Layer.provideMerge(Users.live),
      Layer.provideMerge(Directory.layer),
      Layer.provide(Layer.merge(SecureRandom.layerWebCrypto, recording(noted))),
    ),
  )
  const directory = yield* Effect.provide(Effect.service(Directory), built)
  const answer = (index: number, users: ReadonlyArray<User>) =>
    Effect.flatMap(Ref.get(directory.asked), (asked) =>
      Effect.forEach(asked.slice(index, index + 1), (waiting) => Deferred.succeed(waiting, users)),
    )
  const refuse = (index: number, reason: string) =>
    Effect.flatMap(Ref.get(directory.asked), (asked) =>
      Effect.forEach(asked.slice(index, index + 1), (waiting) => Deferred.fail(waiting, reason)),
    )

  return {
    built,
    noted,
    users: yield* Effect.provide(Effect.service(Users), built),
    roster: yield* Effect.provide(Effect.service(Roster), built),
    calls: Effect.map(Ref.get(directory.asked), (asked) => asked.length),
    answer,
    refuse,
  }
})

describe("server data in a store", () => {
  it.effect("loads on demand, once, and is loading, then loaded, as typed states", () =>
    Effect.gen(function* () {
      const { built, noted, users, calls, answer } = yield* opened

      expect(yield* users.select.status.get).toBe("idle")
      yield* Effect.provide(Users.ensure, built)
      yield* Effect.provide(Users.ensure, built)
      yield* Effect.yieldNow
      expect([yield* users.select.status.get, yield* users.select.loading.get]).toEqual([
        "loading",
        true,
      ])
      expect(yield* calls).toBe(1)

      yield* TestClock.adjust("5 seconds")
      yield* answer(0, [ada])
      yield* Effect.yieldNow

      expect(yield* users.state.get).toEqual({
        status: "loaded",
        value: [ada],
        error: null,
        loadedAt: 5000,
        request: 1,
      })
      expect((yield* Ref.get(noted)).map((seen) => [seen.kind, seen.name])).toEqual([
        ["command", "test/Users/requested"],
        ["command", "test/Users/loaded"],
      ])
    }),
  )

  it.effect("asking again while it loads is refused and seen, not sent twice", () =>
    Effect.gen(function* () {
      const { built, noted, users, calls } = yield* opened

      yield* Effect.provide(Users.ensure, built)
      yield* Effect.provide(Users.refetch, built)
      yield* Effect.yieldNow

      expect(yield* calls).toBe(1)
      expect(yield* users.refused.get).toEqual(
        Option.some({ action: "requested", reason: "It is already loading", payload: null }),
      )
      expect((yield* Ref.get(noted)).map((seen) => seen.kind)).toEqual(["command", "refused"])
    }),
  )

  it.effect("stays fresh for its stale time, then loads again when next needed", () =>
    Effect.gen(function* () {
      const { built, users, calls, answer } = yield* opened

      yield* Effect.provide(Users.ensure, built)
      yield* Effect.yieldNow
      yield* answer(0, [ada])
      yield* Effect.yieldNow
      yield* TestClock.adjust("1 minute")
      yield* Effect.provide(Users.ensure, built)
      yield* Effect.yieldNow
      expect(yield* calls).toBe(1)

      yield* TestClock.adjust("1 second")
      yield* Effect.provide(Users.ensure, built)
      yield* Effect.yieldNow
      expect(yield* calls).toBe(2)
      expect([yield* users.select.status.get, yield* users.select.value.get]).toEqual([
        "loading",
        [ada],
      ])

      yield* answer(1, [ada, grace])
      yield* Effect.yieldNow
      expect(yield* users.select.value.get).toEqual([ada, grace])
    }),
  )

  it.effect("a failure is a typed state, and the next need tries again", () =>
    Effect.gen(function* () {
      const { built, users, calls, refuse, answer } = yield* opened

      yield* Effect.provide(Users.ensure, built)
      yield* Effect.yieldNow
      yield* refuse(0, "The directory is down")
      yield* Effect.yieldNow

      expect([yield* users.select.status.get, yield* users.select.error.get]).toEqual([
        "failed",
        "The directory is down",
      ])

      yield* Effect.provide(Users.ensure, built)
      yield* Effect.yieldNow
      expect(yield* calls).toBe(2)
      yield* answer(1, [grace])
      yield* Effect.yieldNow
      expect([
        yield* users.select.status.get,
        yield* users.select.value.get,
        yield* users.select.error.get,
      ]).toEqual(["loaded", [grace], null])
    }),
  )

  it.effect("an answer to an earlier request is refused", () =>
    Effect.gen(function* () {
      const { built, users } = yield* opened

      yield* Effect.provide(Users.ensure, built)
      yield* Effect.yieldNow
      yield* users.commands.loaded({ request: 0, value: [grace], at: 1 })
      expect(yield* users.select.status.get).toBe("loading")
      yield* users.commands.failed({ request: 7, error: "late" })
      expect(yield* users.select.status.get).toBe("loading")
      expect(yield* users.refused.get).toEqual(
        Option.some({
          action: "failed",
          reason: "This answers an earlier request",
          payload: { request: 7, error: "late" },
        }),
      )
    }),
  )

  it.effect("a command in another store invalidates it, and it loads again at once", () =>
    Effect.gen(function* () {
      const { built, users, roster, calls, answer } = yield* opened

      yield* Effect.provide(Users.ensure, built)
      yield* Effect.yieldNow
      yield* answer(0, [ada])
      yield* Effect.yieldNow

      yield* roster.commands.renamed()
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      expect(yield* calls).toBe(2)
      expect(yield* users.state.get).toMatchObject({
        status: "loading",
        value: [ada],
        loadedAt: null,
      })

      yield* answer(1, [grace])
      yield* Effect.yieldNow
      expect(yield* users.select.value.get).toEqual([grace])
    }),
  )

  it.effect("with no stale time it is stale as soon as time has passed", () =>
    Effect.gen(function* () {
      const built = yield* Layer.build(
        Always.live.pipe(
          Layer.provideMerge(Directory.layer),
          Layer.provide(SecureRandom.layerWebCrypto),
        ),
      )
      const directory = yield* Effect.provide(Effect.service(Directory), built)

      yield* Effect.provide(Always.ensure, built)
      yield* Effect.yieldNow
      yield* Effect.flatMap(Ref.get(directory.asked), (asked) =>
        Effect.forEach(asked, (waiting) => Deferred.succeed(waiting, [ada])),
      )
      yield* Effect.yieldNow
      yield* Effect.provide(Always.ensure, built)
      yield* Effect.yieldNow
      expect(yield* Ref.get(directory.asked)).toHaveLength(1)
      yield* TestClock.adjust("1 milli")
      yield* Effect.provide(Always.ensure, built)
      yield* Effect.yieldNow
      expect(yield* Ref.get(directory.asked)).toHaveLength(2)
    }),
  )

  it.live("can sit beside the view that shows it, with no layer of its own at the root", () =>
    Effect.gen(function* () {
      const Shown = Users.beside(
        View.connect(
          Effect.fnUntraced(function* () {
            const users = yield* Users

            yield* Users.ensure

            return {
              label: "users",
              count: Reactive.map(users.select.value, (value) => value?.length ?? 0),
              onAdd: users.commands.requested(),
            }
          }),
        )(TallyView),
      )

      yield* Testing.mount(Shown)
      yield* Testing.find("button", "Add to users")

      const directory = yield* Directory
      const asked = yield* Effect.repeat(Ref.get(directory.asked), {
        until: (all) => all.length === 1,
        schedule: Schedule.spaced("5 millis"),
      })

      yield* Effect.forEach(asked, (waiting) => Deferred.succeed(waiting, [ada, grace]))
      yield* Testing.eventually(() =>
        expect(document.querySelector('[aria-label="users count"]')?.textContent).toBe("2"),
      )
    }).pipe(Effect.provide(Directory.layer)),
  )
})
