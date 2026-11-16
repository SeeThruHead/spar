import { describe, expect, it } from "@effect/vitest"
import { vi } from "vitest"
import {
  Context,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Predicate,
  PubSub,
  Ref,
  Schema,
  Stream,
  SubscriptionRef,
} from "effect"
import { KeyValueStore } from "effect/persistence"
import { TestClock } from "effect/testing"
import { Outbox, Reactive } from "spar"

class Refused extends Schema.TaggedError<Refused, { readonly brand: unique symbol }>()("Refused", {
  key: Schema.String,
}) {}

const entry = (key: string, seq: number): Outbox.Entry => ({
  key,
  channel: "mail",
  payload: { text: key },
  seq,
})

const alone: Outbox.Environment = {
  online: Reactive.succeed(true),
  ownership: Effect.void,
  announce: Effect.void,
  announced: Stream.empty,
}

const started = Effect.fnUntraced(function* (
  options: Outbox.Options,
  environment: Outbox.Environment = alone,
) {
  const stored = yield* KeyValueStore.KeyValueStore
  const context = yield* Layer.build(
    Outbox.Outbox.layerWith(options).pipe(
      Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, stored)),
      Layer.provide(Layer.succeed(Outbox.Environment, environment)),
    ),
  )

  return Context.get(context, Outbox.Outbox)
})

const patient: Outbox.Options = { maxAttempts: 8, attemptTimeout: "10 seconds" }

const recorder = Effect.fnUntraced(function* (refuse: (key: string) => boolean = () => false) {
  const sent = yield* Ref.make<ReadonlyArray<string>>([])
  const busy = yield* Ref.make({ now: 0, most: 0 })
  const send = Effect.fnUntraced(function* (waiting: Outbox.Entry) {
    yield* Ref.update(busy, ({ now, most }) => ({ now: now + 1, most: Math.max(most, now + 1) }))
    yield* Effect.sleep("100 millis")
    yield* Ref.update(busy, ({ now, most }) => ({ now: now - 1, most }))

    if (refuse(waiting.key)) return yield* new Refused({ key: waiting.key })

    yield* Ref.update(sent, (all) => [...all, waiting.key])
  })

  return { send, sent: Ref.get(sent), most: Effect.map(Ref.get(busy), (state) => state.most) }
})

describe("Outbox", () => {
  it.effect("items on a channel are sent one at a time in the order they were made", () =>
    Effect.gen(function* () {
      const outbox = yield* started(patient)
      const mail = yield* recorder()

      yield* outbox.persist(entry("second", 2))
      yield* outbox.persist(entry("first", 1))
      yield* outbox.persist({ ...entry("elsewhere", 3), channel: "chat" })
      yield* outbox.register("mail", mail.send)
      yield* outbox.persist(entry("third", 3))
      yield* TestClock.adjust("1 second")

      expect(yield* mail.sent).toEqual(["first", "second", "third"])
      expect(yield* mail.most).toBe(1)
      expect(yield* outbox.pending.get).toBe(1)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect(
    "an item that keeps failing is set aside with the reason, and later items still go",
    () =>
      Effect.gen(function* () {
        const outbox = yield* started({ maxAttempts: 2, attemptTimeout: "10 seconds" })
        const mail = yield* recorder((key) => key === "cursed")

        yield* outbox.register("mail", mail.send)
        yield* outbox.persist(entry("cursed", 1))
        yield* outbox.persist(entry("fine", 2))
        yield* TestClock.adjust("5 seconds")

        const dead = yield* outbox.dead.get

        expect(yield* mail.sent).toEqual(["fine"])
        expect(dead.map((lost) => lost.key)).toEqual(["cursed"])
        expect(dead[0]?.reason).toContain("Refused")
        expect(yield* outbox.pending.get).toBe(0)
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect("an attempt that hangs is cut off and counts as a failure", () =>
    Effect.gen(function* () {
      const outbox = yield* started({ maxAttempts: 1, attemptTimeout: "2 seconds" })

      yield* outbox.register("mail", () => Effect.never)
      yield* outbox.persist(entry("stuck", 1))
      yield* TestClock.adjust("2 seconds")

      expect((yield* outbox.dead.get).map((lost) => lost.key)).toEqual(["stuck"])
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect("a set-aside item can be sent again or thrown away, and both survive a restart", () =>
    Effect.gen(function* () {
      const healed = yield* Ref.make(false)
      const first = yield* started({ maxAttempts: 1, attemptTimeout: "10 seconds" })
      const mail = yield* recorder()
      const send = (waiting: Outbox.Entry) =>
        Effect.flatMap(Ref.get(healed), (ok) =>
          ok ? mail.send(waiting) : Effect.fail(new Refused({ key: waiting.key })),
        )

      yield* first.register("mail", send)
      yield* first.persist(entry("keep", 1))
      yield* first.persist(entry("drop", 2))
      yield* TestClock.adjust("1 second")

      const restarted = yield* started({ maxAttempts: 1, attemptTimeout: "10 seconds" })

      expect((yield* restarted.dead.get).map((lost) => lost.key)).toEqual(["keep", "drop"])

      yield* Ref.set(healed, true)
      yield* restarted.register("mail", send)
      yield* restarted.retry("keep")
      yield* restarted.retry("never existed")
      yield* restarted.discard("drop")
      yield* TestClock.adjust("1 second")

      expect(yield* mail.sent).toEqual(["keep"])
      expect(yield* restarted.dead.get).toEqual([])
      expect(yield* restarted.pending.get).toBe(0)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect("a saved item that can no longer be read is set aside and the rest still goes", () =>
    Effect.gen(function* () {
      const saved = yield* KeyValueStore.KeyValueStore

      yield* saved.set("spar/outbox/garbled", "{ not what was written")

      const outbox = yield* started(patient)
      const mail = yield* recorder()

      yield* outbox.register("mail", mail.send)
      yield* outbox.persist(entry("fine", 1))
      yield* TestClock.adjust("1 second")

      const dead = yield* outbox.dead.get

      expect(yield* mail.sent).toEqual(["fine"])
      expect(dead.map((lost) => [lost.key, lost.channel, lost.payload])).toEqual([
        ["garbled", "unreadable", "{ not what was written"],
      ])
      expect(dead[0]?.reason).toBe(
        "What was saved for this item could not be read, so it was not sent.",
      )
      expect(yield* outbox.pending.get).toBe(0)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect("nothing is sent while offline, and sending starts when the connection is back", () =>
    Effect.gen(function* () {
      const connected = yield* SubscriptionRef.make(false)
      const outbox = yield* started(patient, {
        ...alone,
        online: Reactive.fromSubscriptionRef(connected),
      })
      const mail = yield* recorder()

      yield* outbox.register("mail", mail.send)
      yield* outbox.persist(entry("waiting", 1))
      yield* TestClock.adjust("1 minute")

      expect(yield* mail.sent).toEqual([])
      expect(yield* outbox.dead.get).toEqual([])

      yield* SubscriptionRef.set(connected, true)
      yield* TestClock.adjust("1 second")

      expect(yield* mail.sent).toEqual(["waiting"])
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect("only the tab that owns sending sends, and it picks up what another tab saved", () =>
    Effect.gen(function* () {
      const granted = yield* Deferred.make<void>()
      const air = yield* PubSub.unbounded<void>()
      const shared: Outbox.Environment = {
        ...alone,
        announce: Effect.asVoid(PubSub.publish(air, undefined)),
        announced: Stream.fromPubSub(air),
      }
      const owner = yield* started(patient, { ...shared, ownership: Deferred.await(granted) })
      const other = yield* started(patient, { ...shared, ownership: Effect.never })
      const ownerMail = yield* recorder()
      const otherMail = yield* recorder()

      yield* owner.register("mail", ownerMail.send)
      yield* other.register("mail", otherMail.send)
      yield* other.persist(entry("from the other tab", 1))
      yield* TestClock.adjust("1 second")

      expect(yield* ownerMail.sent).toEqual([])
      expect(yield* owner.pending.get).toBe(1)

      yield* Deferred.succeed(granted, undefined)
      yield* TestClock.adjust("1 second")
      yield* other.persist(entry("and another", 2))
      yield* TestClock.adjust("1 second")

      expect(yield* ownerMail.sent).toEqual(["from the other tab", "and another"])
      expect(yield* otherMail.sent).toEqual([])
      expect(yield* other.pending.get).toBe(0)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.live(
    "in a browser it follows the connection, tells other tabs and takes the shared lock",
    () =>
      Effect.gen(function* () {
        const environment = yield* Outbox.Environment
        const heard = yield* Deferred.make<string>()
        const neighbour = yield* Effect.acquireRelease(
          Effect.sync(() => new BroadcastChannel("spar/outbox")),
          (channel) => Effect.sync(() => channel.close()),
        )
        const told = yield* Effect.forkChild(Stream.runHead(environment.announced), {
          startImmediately: true,
        })

        yield* Effect.sync(() =>
          neighbour.addEventListener("message", (event) =>
            Deferred.doneUnsafe(heard, Effect.succeed(String(event.data))),
          ),
        )
        yield* environment.ownership
        yield* environment.announce
        yield* Effect.sync(() => neighbour.postMessage("changed"))
        yield* Effect.sync(() => window.dispatchEvent(new Event("offline")))

        expect(yield* Deferred.await(heard)).toBe("changed")
        expect(Option.isSome(yield* Fiber.join(told))).toBe(true)
        expect(yield* environment.online.get).toBe(false)
      }).pipe(Effect.provide(Outbox.layerBrowser)),
  )

  it.live("the shared lock is held while the app runs and given back when it stops", () =>
    Effect.gen(function* () {
      const released = yield* Deferred.make<string>()
      const locks = vi.spyOn(navigator, "locks", "get").mockReturnValue({
        query: () => Promise.resolve({}),
        request: async (name: string, ...rest: ReadonlyArray<unknown>) => {
          const hold = rest.at(-1)
          const result = Predicate.isFunction(hold) ? await hold(null) : undefined

          Deferred.doneUnsafe(released, Effect.succeed(name))

          return result
        },
      })

      yield* Effect.scoped(
        Effect.gen(function* () {
          const environment = yield* Outbox.Environment

          yield* environment.ownership
        }).pipe(Effect.provide(Outbox.layerBrowser)),
      )

      expect(yield* Deferred.await(released)).toBe("spar/outbox")
      locks.mockRestore()
    }),
  )
})
