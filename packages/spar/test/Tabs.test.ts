import { describe, expect, it, vi } from "@effect/vitest"
import { Deferred, Effect, Fiber, Predicate, Ref, Schedule, Stream } from "effect"
import { Tabs } from "spar"

const firstHeard = (times: Ref.Ref<number>): Effect.Effect<number> =>
  Ref.get(times).pipe(
    Effect.filterOrFail((count) => count > 0),
    Effect.retry(Schedule.spaced("2 millis")),
    Effect.timeout("2 seconds"),
    Effect.orDie,
  )

const queueingLocks = () => {
  const tails = new Map<string, Promise<unknown>>()
  const held = new Set<string>()

  return {
    query: () => Promise.resolve({ held: [...held].map((name) => ({ name })) }),
    request: (name: string, ...rest: ReadonlyArray<unknown>) => {
      const hold = rest.at(-1)
      const run = (tails.get(name) ?? Promise.resolve())
        .then(() => {
          held.add(name)

          return Predicate.isFunction(hold) ? hold(null) : undefined
        })
        .finally(() => held.delete(name))

      tails.set(name, run)

      return run
    },
  }
}

describe("tabs in a browser", () => {
  it.live("work done exclusively under one name happens one at a time across tabs", () =>
    Effect.gen(function* () {
      const locks = vi.spyOn(navigator, "locks", "get").mockReturnValue(queueingLocks())
      const tabs = yield* Tabs.Tabs
      const order = yield* Ref.make<ReadonlyArray<string>>([])
      const gate = yield* Deferred.make<void>()
      const note = (text: string) => Ref.update(order, (all) => [...all, text])

      const slow = yield* Effect.forkChild(
        tabs.exclusively("ledger", Effect.andThen(Deferred.await(gate), note("first done"))),
        { startImmediately: true },
      )
      const quick = yield* Effect.forkChild(tabs.exclusively("ledger", note("second done")), {
        startImmediately: true,
      })

      yield* tabs.exclusively("another name", note("unrelated done"))
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(slow)
      yield* Fiber.join(quick)

      expect(yield* Ref.get(order)).toEqual(["unrelated done", "first done", "second done"])
      locks.mockRestore()
    }).pipe(Effect.provide(Tabs.layerBrowser)),
  )

  it.live("a tab can say it is here, and others can tell for as long as it is", () =>
    Effect.gen(function* () {
      const locks = vi.spyOn(navigator, "locks", "get").mockReturnValue(queueingLocks())
      const tabs = yield* Tabs.Tabs

      expect(yield* tabs.here("ledger/tab/a")).toBe(false)

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* tabs.stay("ledger/tab/a")

          expect(yield* tabs.here("ledger/tab/a")).toBe(true)
          expect(yield* tabs.here("ledger/tab/b")).toBe(false)
        }),
      )
      yield* Effect.sleep("5 millis")

      expect(yield* tabs.here("ledger/tab/a")).toBe(false)
      locks.mockRestore()
    }).pipe(Effect.provide(Tabs.layerBrowser)),
  )

  it.live("when the browser cannot say which tabs are open, every tab counts as still open", () =>
    Effect.gen(function* () {
      const locks = vi.spyOn(navigator, "locks", "get").mockReturnValue({
        ...queueingLocks(),
        query: () => Promise.reject(new Error("the lock manager is gone")),
      })
      const tabs = yield* Tabs.Tabs

      expect(yield* tabs.here("ledger/tab/a")).toBe(true)
      locks.mockRestore()
    }).pipe(Effect.provide(Tabs.layerBrowser)),
  )

  it.live("where the browser has no locks the work still runs", () =>
    Effect.gen(function* () {
      const tabs = yield* Tabs.Tabs

      yield* tabs.stay("ledger/tab/a")

      expect(yield* tabs.here("ledger/tab/a")).toBe(false)
      expect(yield* tabs.exclusively("ledger", Effect.succeed("ran"))).toBe("ran")
    }).pipe(Effect.provide(Tabs.layerBrowser)),
  )

  it.live("a tab hears what other tabs announce under a name, and nothing else", () =>
    Effect.gen(function* () {
      const tabs = yield* Tabs.Tabs
      const heard = yield* Deferred.make<string>()
      const neighbour = yield* Effect.acquireRelease(
        Effect.sync(() => new BroadcastChannel("spar/tabs")),
        (channel) => Effect.sync(() => channel.close()),
      )
      const times = yield* Ref.make(0)
      const closed = vi.spyOn(BroadcastChannel.prototype, "close")
      const told = yield* Effect.forkChild(
        Stream.runForEach(tabs.announced("ledger"), () => Ref.update(times, (count) => count + 1)),
        { startImmediately: true },
      )

      yield* Effect.sync(() =>
        neighbour.addEventListener("message", (event) =>
          Deferred.doneUnsafe(heard, Effect.succeed(String(event.data))),
        ),
      )
      yield* Effect.sleep("5 millis")
      yield* tabs.announce("ledger")
      yield* Effect.sync(() => neighbour.postMessage("something else"))
      yield* Effect.sync(() => neighbour.postMessage("ledger"))

      expect(yield* Deferred.await(heard)).toBe("ledger")
      expect(yield* firstHeard(times)).toBe(1)
      expect(closed.mock.calls).toHaveLength(0)

      yield* Effect.sync(() => window.dispatchEvent(new StorageEvent("storage", { key: "other" })))
      yield* Effect.sync(() => window.dispatchEvent(new StorageEvent("storage", { key: "ledger" })))
      yield* Effect.sleep("10 millis")

      expect(yield* Ref.get(times)).toBe(2)

      const state = vi.spyOn(document, "visibilityState", "get")

      state.mockReturnValue("hidden")
      yield* Effect.sync(() => document.dispatchEvent(new Event("visibilitychange")))
      state.mockReturnValue("visible")
      yield* Effect.sync(() => document.dispatchEvent(new Event("visibilitychange")))
      yield* Effect.sleep("10 millis")
      state.mockRestore()

      expect(yield* Ref.get(times)).toBe(3)

      yield* Fiber.interrupt(told)

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          expect(closed.mock.calls.length).toBeGreaterThan(0)
          closed.mockRestore()
        }),
      )
    }).pipe(Effect.provide(Tabs.layerBrowser)),
  )

  it.effect("on its own a tab just runs the work and hears nothing", () =>
    Effect.gen(function* () {
      const tabs = yield* Tabs.Tabs

      yield* tabs.announce("ledger")
      yield* tabs.stay("ledger/tab/a")

      expect(yield* tabs.here("ledger/tab/a")).toBe(false)
      expect(yield* tabs.exclusively("ledger", Effect.succeed("ran"))).toBe("ran")
      expect(yield* Stream.runCollect(tabs.announced("ledger"))).toEqual([])
    }),
  )
})
