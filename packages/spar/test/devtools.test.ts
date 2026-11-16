import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Layer, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { Devtools, Store, View } from "spar"
import * as Testing from "spar/testing"
import { jsx } from "spar/jsx-runtime"

type State = { readonly count: number }

const initialState: State = { count: 0 }

class Tally extends Store.Tag<Tally>()("test/Tally", {
  initialState,
  actions: {
    added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
  },
  selectors: { count: (state) => state.count },
}) {}

const layer = Tally.layer().pipe(
  Layer.provideMerge(Devtools.layer),
  Layer.provide(SecureRandom.layerWebCrypto),
)

const Screen = View.connect(
  Effect.fnUntraced(function* () {
    const tally = yield* Tally

    return {
      count: tally.select.count,
      tools: yield* View.child(Devtools.Panel, {}),
    }
  }),
)(({ count, tools }) =>
  jsx("main", { children: [jsx("output", { "aria-label": "Count", children: count }), tools] }),
)

const count = (): string | null => screen.getByLabelText("Count").textContent

const position = (): string | null => screen.getByLabelText("test/Tally position").textContent

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
