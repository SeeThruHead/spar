import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Layer, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import { Outbox, Props, Store, View, compose } from "spar"
import * as Devtools from "spar/devtools"
import * as Testing from "spar/testing"
import { jsx } from "spar/jsx-runtime"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

const initialState: State = { count: 0 }

class Tally extends Store.Tag<Tally>()("test/Tally", {
  state: State,
  initialState,
  actions: {
    added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
  },
  selectors: { count: Store.selector(Schema.Finite, (state: State) => state.count) },
}) {}

const layer = Tally.layer().pipe(
  Layer.provideMerge(Devtools.layer),
  Layer.provide(SecureRandom.layerWebCrypto),
)

const Screen = compose(
  Effect.fnUntraced(function* () {
    const tally = yield* Tally

    return {
      count: tally.select.count,
      tools: yield* View.child(Devtools.Panel, {}),
    }
  }),
)(
  View.make(
    "ScreenView",
    { count: Props.Reactive(Schema.Finite), tools: Props.Element },
    ({ count, tools }) =>
      jsx("main", { children: [jsx("output", { "aria-label": "Count", children: count }), tools] }),
  ),
)

const count = (): string | null => screen.getByLabelText("Count").textContent

const position = (): string | null => screen.getByLabelText("test/Tally position").textContent

const exported = (): string => {
  const box = screen.getByLabelText("test/Tally exported log")

  return box instanceof HTMLTextAreaElement ? box.value : ""
}

const problem = (): string | null => screen.getByLabelText("test/Tally problem").textContent

const waiting = (): string | null => screen.getByLabelText("Outbox waiting").textContent

const shows = (expected: string, where: string) =>
  Testing.eventually(() => expect([count(), position()]).toEqual([expected, where]))

describe("devtools", () => {
  it.live("lists each action and steps the screen back and forward through them", () =>
    Effect.gen(function* () {
      const tally = yield* Tally

      yield* Testing.mount(Screen)
      yield* Testing.click("button", "Back")
      yield* shows("0", "live")
      yield* tally.commands.added({ by: 1 })
      yield* tally.commands.added({ by: 10 })
      yield* tally.commands.added({ by: 100 })
      yield* Testing.findText('added {"by":100}')
      yield* shows("111", "live")

      yield* Testing.click("button", "Back")
      yield* shows("11", "action 2")
      yield* Testing.click("button", "Back")
      yield* Testing.click("button", "Back")
      yield* shows("1", "action 1")
      yield* Testing.click("button", "Forward")
      yield* shows("11", "action 2")

      yield* tally.commands.added({ by: 1000 })
      yield* Effect.sleep("10 millis")
      yield* shows("11", "action 2")

      yield* Testing.click("button", "Go to 3")
      yield* shows("111", "action 3")
      yield* Testing.click("button", "Forward")
      yield* Testing.click("button", "Forward")
      yield* shows("1111", "live")
      yield* Testing.click("button", "Back")
      yield* Testing.click("button", "Live")
      yield* shows("1111", "live")

      expect(screen.getByLabelText("test/Tally state").textContent).toContain('"count": 1111')
      expect(screen.getAllByRole("listitem")[3]?.getAttribute("aria-current")).toBe("false")
    }).pipe(Effect.provide(layer)),
  )

  it.live(
    "a log can be copied out, and a log put in is stepped through without touching the live state",
    () =>
      Effect.gen(function* () {
        const tally = yield* Tally

        yield* Testing.mount(Screen)
        yield* tally.commands.added({ by: 1 })
        yield* tally.commands.added({ by: 10 })
        yield* tally.commands.added({ by: 100 })
        yield* Testing.click("button", "Export log")
        yield* Testing.eventually(() => expect(exported()).toContain('"action":"added"'))

        const entries = yield* Schema.decodeEffect(Store.LogText)(exported())

        expect(entries.map((entry) => [entry.seq, entry.payload])).toEqual([
          [1, { by: 1 }],
          [2, { by: 10 }],
          [3, { by: 100 }],
        ])

        yield* Testing.fill(
          "textbox",
          "test/Tally log to load",
          yield* Schema.encodeEffect(Store.LogText)([
            { id: "a", action: "added", payload: { by: 7 }, seq: 1 },
            { id: "b", action: "added", payload: { by: 70 }, seq: 2 },
          ]),
        )
        yield* Testing.click("button", "Load log")
        yield* shows("77", "action 2")
        yield* Testing.findText('added {"by":70}')
        yield* Testing.click("button", "Back")
        yield* shows("7", "action 1")
        yield* Testing.click("button", "Live")
        yield* shows("111", "live")
        yield* Testing.findText('added {"by":100}')

        expect(yield* tally.state.get).toEqual({ count: 111 })
      }).pipe(Effect.provide(layer)),
  )

  it.live("a log that cannot be read or holds an unknown action says so and changes nothing", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Screen)
      yield* Testing.fill("textbox", "test/Tally log to load", "not a log")
      yield* Testing.click("button", "Load log")
      yield* Testing.eventually(() => expect(problem()).not.toBe(""))
      yield* Testing.fill(
        "textbox",
        "test/Tally log to load",
        yield* Schema.encodeEffect(Store.LogText)([
          { id: "a", action: "renamed", payload: {}, seq: 1 },
        ]),
      )
      yield* Testing.click("button", "Load log")
      yield* Testing.eventually(() =>
        expect(problem()).toContain(
          "[SPAR_UNKNOWN_ACTION] The log holds an action this store does not define: renamed",
        ),
      )
      yield* shows("0", "live")
      yield* Testing.fill("textbox", "test/Tally log to load", "[]")
      yield* Testing.click("button", "Load log")
      yield* Testing.eventually(() => expect(problem()).toBe(""))
      yield* shows("0", "live")
    }).pipe(Effect.provide(layer)),
  )

  it.effect("actions restored from the device can be stepped to as well", () =>
    Effect.gen(function* () {
      const stored = yield* KeyValueStore.KeyValueStore
      const kept = Tally.layerDurable().pipe(
        Layer.provideMerge(Devtools.layer),
        Layer.provide(SecureRandom.layerWebCrypto),
        Layer.provide(Layer.succeed(KeyValueStore.KeyValueStore, stored)),
      )

      yield* Tally.use((tally) =>
        Effect.andThen(tally.commands.added({ by: 2 }), tally.commands.added({ by: 20 })),
      ).pipe(Effect.provide(kept))

      const earlier = yield* Tally.use((tally) =>
        Effect.andThen(tally.travelTo(1), tally.state.get),
      ).pipe(Effect.provide(kept))

      expect(earlier).toEqual({ count: 2 })
    }).pipe(Effect.provide(KeyValueStore.layerMemory)),
  )

  it.effect(
    "a store can be asked by name to carry out an action, and refuses what it does not know",
    () =>
      Effect.gen(function* () {
        const tally = yield* Tally
        const registry = yield* Devtools.Registry
        const [inspected] = yield* registry.stores.get
        const run = inspected?.run ?? (() => Effect.void)

        yield* run("added", { by: 5 })

        expect(yield* tally.state.get).toEqual({ count: 5 })
        expect((yield* Effect.flip(run("renamed", {})))._tag).toBe("UnknownAction")
        expect((yield* Effect.flip(run("added", { by: "plenty" })))._tag).toBe("SchemaError")
        expect(yield* tally.state.get).toEqual({ count: 5 })
      }).pipe(Effect.provide(layer)),
  )

  it.live("what the outbox could not send is listed and can be tried again or dropped", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Screen)

      const outbox = screen.getByRole("region", { name: "Outbox" })

      yield* Testing.eventually(() => expect(outbox.textContent).toContain("could not be read"))
      yield* Testing.eventually(() => expect(waiting()).toBe("0"))
      yield* Testing.click("button", "Retry")
      yield* Testing.eventually(() => expect(waiting()).toBe("1"))

      yield* Testing.gone("button", "Discard")
    }).pipe(
      Effect.provide(
        layer.pipe(
          Layer.provideMerge(Outbox.Outbox.layer),
          Layer.provide(
            Layer.effect(
              KeyValueStore.KeyValueStore,
              Effect.tap(KeyValueStore.KeyValueStore, (stored) =>
                stored.set("spar/outbox/garbled", "{ not what was written"),
              ),
            ).pipe(Layer.provide(KeyValueStore.layerMemory)),
          ),
        ),
      ),
    ),
  )

  it.live("something the outbox gave up on can be dropped for good", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Screen)
      yield* Testing.click("button", "Discard")
      yield* Testing.gone("button", "Discard")

      expect(waiting()).toBe("0")
    }).pipe(
      Effect.provide(
        layer.pipe(
          Layer.provideMerge(Outbox.Outbox.layer),
          Layer.provide(
            Layer.effect(
              KeyValueStore.KeyValueStore,
              Effect.tap(KeyValueStore.KeyValueStore, (stored) =>
                stored.set("spar/outbox/garbled", "{ not what was written"),
              ),
            ).pipe(Layer.provide(KeyValueStore.layerMemory)),
          ),
        ),
      ),
    ),
  )

  it.effect("travelling to an action that is no longer kept shows the live state", () =>
    Effect.gen(function* () {
      const tally = yield* Tally

      yield* tally.commands.added({ by: 5 })
      yield* tally.travelTo(99)

      expect(yield* tally.state.get).toEqual({ count: 5 })
      expect(yield* tally.viewing.get).toBe(99)
    }).pipe(Effect.provide(layer)),
  )
})
