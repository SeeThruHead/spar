import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Layer, Ref, Schedule, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { Reactive, Router, Store, Timeline, UiState, View } from "spar"
import * as Devtools from "spar/devtools"
import * as Testing from "spar/testing"
import { DeskView } from "./timeline.tsx"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

class Tally extends Store.Tag<Tally>()("test/Tally", {
  state: State,
  initialState: { count: 0 },
  actions: {
    added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
  },
  selectors: { count: Store.selector(Schema.Finite, (state: State) => state.count) },
}) {}

const next = Router.route("/next")

const Desk = View.connect(
  Effect.fnUntraced(function* () {
    const tally = yield* Tally
    const router = yield* Router.Router

    return {
      count: tally.select.count,
      draft: yield* UiState.make("draft", Schema.String, ""),
      onAdd: tally.commands.added({ by: 1 }),
      onGo: router.go(next, {}),
    }
  }),
)(DeskView)

const layer = Layer.mergeAll(Tally.layer(), Router.Router.layerMemory("/")).pipe(
  Layer.provideMerge(Devtools.layer),
  Layer.provide(SecureRandom.layerWebCrypto),
  Layer.provideMerge(Layer.sync(UiState.Tree, UiState.makeTree)),
)

const shown = (): ReadonlyArray<string | null> => {
  const draft = screen.getByLabelText("Draft")

  return [
    screen.getByLabelText("Count").textContent,
    draft instanceof HTMLInputElement ? draft.value : null,
  ]
}

const shows = (count: string, draft: string) =>
  Testing.eventually(() => expect(shown()).toEqual([count, draft]))

describe("one log of everything that happened", () => {
  it.live("commands, UI state and route changes are in one order, each with its trace", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry

      yield* Testing.mount(Desk)
      yield* Testing.fill("textbox", "Draft", "hi")
      yield* Testing.click("button", "Add")
      yield* shows("1", "hi")
      yield* Testing.click("button", "Go")
      yield* Timeline.note("data", "threads", () => 3)

      const moments = yield* Effect.repeat(registry.moments.get, {
        until: (all) => all.length === 4,
        schedule: Schedule.spaced("5 millis"),
      })

      expect(
        moments.map((moment) => [moment.seq, moment.kind, moment.name, moment.detail]),
      ).toEqual([
        [1, "ui", "DeskView . draft", "hi"],
        [2, "command", "test/Tally/added", { by: 1 }],
        [3, "route", "/next", "link"],
        [4, "data", "threads", 3],
      ])
      expect(moments.slice(0, 3).every((moment) => moment.traceId.length === 32)).toBe(true)
      expect(moments.slice(0, 3).every((moment) => moment.spanId.length === 16)).toBe(true)
      expect(new Set(moments.map((moment) => moment.traceId)).size).toBe(4)
      expect([moments[3]?.traceId, moments[3]?.spanId]).toEqual(["", ""])
    }).pipe(Effect.provide(layer)),
  )

  it.live("going back to a moment shows the stores and the UI state as they were then", () =>
    Effect.gen(function* () {
      const registry = yield* Devtools.Registry

      yield* Testing.mount(Desk)
      yield* Testing.fill("textbox", "Draft", "hi")
      yield* Testing.click("button", "Add")
      yield* shows("1", "hi")
      yield* Testing.fill("textbox", "Draft", "later")
      yield* shows("1", "later")

      const inspector = yield* Store.Inspector
      const sentTo = yield* Ref.make<ReadonlyArray<number | null>>([])

      yield* inspector.register({
        key: "test/Late",
        base: 7,
        state: Reactive.succeed(null),
        log: Reactive.succeed([]),
        viewing: Reactive.succeed(null),
        travelTo: (seq) => Ref.update(sentTo, (all) => [...all, seq]),
        load: () => Effect.void,
        run: () => Effect.void,
      })
      yield* registry.travelTo(1)
      yield* shows("0", "hi")
      expect(yield* registry.viewing.get).toBe(1)
      expect(yield* Ref.get(sentTo)).toEqual([7])
      yield* registry.travelTo(2)
      yield* shows("1", "hi")
      yield* registry.travelTo(3)
      yield* shows("1", "later")
      yield* registry.travelTo(1)
      yield* registry.travelTo(null)
      yield* shows("1", "later")
      expect(yield* registry.viewing.get).toBeNull()
      yield* registry.travelTo(1)
      yield* registry.travelTo(99)
      yield* shows("1", "later")
      expect(yield* registry.viewing.get).toBeNull()
    }).pipe(Effect.provide(layer)),
  )
})
