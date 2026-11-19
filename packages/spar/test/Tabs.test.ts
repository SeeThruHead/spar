import { describe, expect, it, vi } from "@effect/vitest"
import {
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Function,
  Layer,
  Predicate,
  PubSub,
  Ref,
  Schema,
  Scope,
  Semaphore,
  Stream,
} from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import { App, Store, Tabs } from "spar"

const State = Schema.Struct({ total: Schema.Finite, notes: Schema.Array(Schema.String) })

type State = typeof State.Type

const initialState: State = { total: 0, notes: [] }

class Ledger extends Store.Tag<Ledger>()("test/Ledger", {
  state: State,
  initialState,
  actions: {
    added: Store.action(Schema.Struct({ amount: Schema.Finite }), (state: State, { amount }) => ({
      ...state,
      total: state.total + amount,
    })),
    noted: Store.action(Schema.Struct({ text: Schema.String }), (state: State, { text }) => ({
      ...state,
      notes: [...state.notes, text],
    })),
  },
  selectors: { total: Store.selector(Schema.Finite, (state: State) => state.total) },
}) {}

type Told = { readonly from: string; readonly name: string }

const browser = Effect.gen(function* () {
  const lock = yield* Semaphore.make(1)
  const air = yield* PubSub.unbounded<Told>()
  const open = yield* Ref.make<ReadonlyArray<string>>([])

  return (tab: string): Tabs.Tabs => ({
    stay: (name) =>
      Effect.acquireRelease(
        Ref.update(open, (all) => [...all, name]),
        () => Ref.update(open, (all) => all.filter((other) => other !== name)),
      ),
    here: (name) => Effect.map(Ref.get(open), (all) => all.includes(name)),
    exclusively: (_name, effect) => Semaphore.withPermit(lock, effect),
    announce: (name) => Effect.asVoid(PubSub.publish(air, { from: tab, name })),
    announced: (name) =>
      Stream.fromPubSub(air).pipe(
        Stream.filter((told) => told.from !== tab && told.name === name),
        Stream.map(Function.constVoid),
      ),
  })
})

const openTabIn = Effect.fnUntraced(function* (
  tabs: Tabs.Tabs,
  scope: Scope.Scope,
  reactions: ReadonlyArray<Store.Reaction<State>> = [],
) {
  const stored = yield* KeyValueStore.KeyValueStore
  const built = yield* Layer.buildWithScope(
    Ledger.layerDurable({ compactAfter: 3 }, reactions).pipe(
      Layer.provide(SecureRandom.layerWebCrypto),
      Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, stored)),
      Layer.provide(Layer.succeed(Tabs.Tabs, tabs)),
    ),
    scope,
  )

  return Context.get(built, Ledger)
})

const openTabWith = (tabs: Tabs.Tabs, reactions: ReadonlyArray<Store.Reaction<State>>) =>
  Effect.flatMap(Effect.scope, (scope) => openTabIn(tabs, scope, reactions))

const openTab = (tabs: Tabs.Tabs) => openTabWith(tabs, [])

const pendingKeys = Effect.gen(function* () {
  const stored = yield* KeyValueStore.KeyValueStore
  const keys = yield* stored.keys

  return keys.filter((key) => key.startsWith("spar/store/test/Ledger/pending/"))
})

const tabThatStalls = Effect.fnUntraced(function* (tabs: Tabs.Tabs) {
  const stalled = yield* Ref.make(false)
  const scope = yield* Scope.make()
  const tab = yield* openTabIn(
    {
      ...tabs,
      exclusively: (name, effect) =>
        Effect.flatMap(Ref.get(stalled), (stuck) =>
          stuck ? Effect.never : tabs.exclusively(name, effect),
        ),
    },
    scope,
  )

  yield* Ref.set(stalled, true)

  const asking = yield* Effect.forkChild(tab.commands.added({ amount: 4 }), {
    startImmediately: true,
  })
  const alsoAsking = yield* Effect.forkChild(tab.commands.added({ amount: 3 }), {
    startImmediately: true,
  })

  return {
    close: Fiber.interrupt(asking).pipe(
      Effect.andThen(Fiber.interrupt(alsoAsking)),
      Effect.andThen(Scope.close(scope, Exit.void)),
    ),
  }
})

const twoTabs = Effect.gen(function* () {
  const tabs = yield* browser
  const first = yield* openTab(tabs("first"))
  const second = yield* openTab(tabs("second"))

  return { first, second, tabs }
})

const reaches = (tab: Context.Service.Shape<typeof Ledger>, total: number) =>
  Stream.runHead(Stream.filter(tab.state.changes, (state) => state.total === total))

const left = (count: number): string => `spar/store/test/Ledger/pending/old/00000000000${count}`

const Amount = Schema.Int.check(Schema.isBetween({ minimum: -50, maximum: 50 }))

const Move = Schema.Struct({ inFirst: Schema.Boolean, amount: Amount })

describe("a store kept on the device with several tabs open", () => {
  it.live("a command in one tab builds on what the other tabs already did", () =>
    Effect.gen(function* () {
      const { first, second } = yield* twoTabs

      yield* first.commands.added({ amount: 5 })
      yield* second.commands.noted({ text: "from the second tab" })
      yield* second.commands.added({ amount: 3 })

      expect(yield* second.state.get).toEqual({ total: 8, notes: ["from the second tab"] })
      expect((yield* second.log.get).map((entry) => entry.seq)).toEqual([1, 2, 3])
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.live("a tab that is doing nothing follows what the others do", () =>
    Effect.gen(function* () {
      const { first, second } = yield* twoTabs

      yield* first.commands.added({ amount: 5 })
      yield* reaches(second, 5)
      yield* second.commands.added({ amount: 2 })
      yield* reaches(first, 7)

      expect(yield* first.state.get).toEqual(yield* second.state.get)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.live("a tab left behind by a fold of old entries starts again from the saved state", () =>
    Effect.gen(function* () {
      const tabs = yield* browser
      const quiet = yield* openTab({ ...tabs("quiet"), announced: () => Stream.empty })
      const busy = yield* openTab(tabs("busy"))

      yield* Effect.forEach([1, 2, 3, 4, 5], (amount) => busy.commands.added({ amount }), {
        discard: true,
      })

      expect(yield* quiet.select.total.get).toBe(0)

      yield* quiet.commands.added({ amount: 10 })

      expect(yield* quiet.select.total.get).toBe(25)
      expect((yield* quiet.log.get).at(-1)?.seq).toBe(6)

      const later = yield* openTab(tabs("later"))

      expect(yield* later.select.total.get).toBe(25)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.live("a tab whose saved data is cleared under it carries on from what it has", () =>
    Effect.gen(function* () {
      const stored = yield* KeyValueStore.KeyValueStore
      const { first } = yield* twoTabs

      yield* first.commands.added({ amount: 5 })
      yield* stored.clear
      yield* first.commands.added({ amount: 2 })

      expect(yield* first.select.total.get).toBe(7)
      expect((yield* first.log.get).map((entry) => entry.seq)).toEqual([1, 2])
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.live("what a tab asked for just before it closed is done by the next tab to open", () =>
    Effect.gen(function* () {
      const tabs = yield* browser
      const closing = yield* tabThatStalls(tabs("closing"))

      expect(yield* pendingKeys).toHaveLength(2)

      yield* closing.close

      const seen = yield* Ref.make<ReadonlyArray<number>>([])
      const next = yield* openTabWith(tabs("next"), [
        Store.after(Ledger.actions.added, ({ amount }) =>
          Ref.update(seen, (all) => [...all, amount]),
        ),
      ])

      yield* next.commands.noted({ text: "a note is not an amount" })
      yield* Effect.yieldNow

      expect(yield* next.select.total.get).toBe(7)
      expect(yield* Ref.get(seen)).toEqual([4, 3])
      expect((yield* next.log.get).map((entry) => entry.action)).toEqual([
        "added",
        "added",
        "noted",
      ])
      expect(yield* pendingKeys).toEqual([])
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.live("what a tab that is still open asked for is left for that tab to finish", () =>
    Effect.gen(function* () {
      const tabs = yield* browser
      const slow = yield* tabThatStalls(tabs("slow"))
      const other = yield* openTab(tabs("other"))

      expect(yield* other.select.total.get).toBe(0)
      expect(yield* pendingKeys).toHaveLength(2)

      yield* slow.close
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.live("a request left behind that this version cannot carry out is dropped and reported", () =>
    Effect.gen(function* () {
      const stored = yield* KeyValueStore.KeyValueStore
      const reports = yield* Ref.make<ReadonlyArray<unknown>>([])
      const tabs = yield* browser
      yield* stored.set(left(1), JSON.stringify({ action: "renamed", payload: {} }))
      yield* stored.set(left(2), "{ not what was written")
      yield* stored.set(left(3), JSON.stringify({ action: "added", payload: { amount: "lots" } }))
      yield* stored.set(left(4), JSON.stringify({ action: "added", payload: { amount: 2 } }))

      const tab = yield* openTab(tabs("new")).pipe(
        Effect.provideService(App.CrashReporter, (defect) =>
          Ref.update(reports, (all) => [...all, defect]),
        ),
      )

      expect(yield* tab.select.total.get).toBe(2)
      expect(yield* pendingKeys).toEqual([])
      expect((yield* Ref.get(reports)).map((report) => String(report).split("\n")[0])).toEqual([
        'Abandoned: [SPAR_ABANDONED_ACTION] An earlier tab asked test/Ledger for "renamed" and closed before it was done. This version cannot carry it out, so it was dropped.',
        'Abandoned: [SPAR_ABANDONED_ACTION] An earlier tab asked test/Ledger for "added" and closed before it was done. This version cannot carry it out, so it was dropped.',
      ])
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.live("with devtools on, what another tab did can be stepped back to", () =>
    Effect.gen(function* () {
      const { first, second } = yield* twoTabs

      yield* first.commands.added({ amount: 5 })
      yield* second.commands.added({ amount: 2 })
      yield* reaches(first, 7)
      yield* first.travelTo(1)

      expect((yield* first.state.get).total).toBe(5)

      yield* first.travelTo(2)

      expect((yield* first.state.get).total).toBe(7)
    }).pipe(
      Effect.provideService(Store.Inspector, { keepStates: 10, register: () => Effect.void }),
      Effect.provide(KeyValueStore.layerMemory),
    ),
  )

  it.live("a tab opened later starts from everything already done", () =>
    Effect.gen(function* () {
      const { first, tabs } = yield* twoTabs

      yield* first.commands.added({ amount: 4 })

      const third = yield* openTab(tabs("third"))

      yield* third.commands.added({ amount: 1 })
      yield* reaches(first, 5)

      expect(yield* third.select.total.get).toBe(5)
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect.prop(
    "any mix of commands across two tabs ends with both agreeing, and a restart agrees too",
    [Schema.Array(Move)],
    ([moves]) =>
      Effect.gen(function* () {
        const { first, second, tabs } = yield* twoTabs

        yield* Effect.forEach(
          moves,
          ({ inFirst, amount }) => (inFirst ? first : second).commands.added({ amount }),
          { discard: true },
        )
        yield* first.commands.noted({ text: "done" })
        yield* second.commands.noted({ text: "done" })

        const expected = moves.reduce((sum, move) => sum + move.amount, 0)
        const restarted = yield* openTab(tabs("restarted"))

        expect((yield* second.state.get).total).toBe(expected)
        expect(yield* restarted.state.get).toEqual(yield* second.state.get)
        expect((yield* restarted.state.get).notes).toEqual(["done", "done"])
      }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )
})

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

      yield* Effect.sleep("10 millis")

      expect(yield* Ref.get(times)).toBe(1)
      expect(closed.mock.calls).toHaveLength(0)

      const state = vi.spyOn(document, "visibilityState", "get")

      state.mockReturnValue("hidden")
      yield* Effect.sync(() => document.dispatchEvent(new Event("visibilitychange")))
      state.mockReturnValue("visible")
      yield* Effect.sync(() => document.dispatchEvent(new Event("visibilitychange")))
      yield* Effect.sleep("10 millis")
      state.mockRestore()

      expect(yield* Ref.get(times)).toBe(2)

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
