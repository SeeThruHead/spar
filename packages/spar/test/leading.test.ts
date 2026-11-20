import { describe, expect, it } from "@effect/vitest"
import { Context, Deferred, Effect, Layer, Option, Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({ clicks: Schema.Finite, saved: Schema.Finite })

type State = typeof State.Type

class Saver extends Store.Tag<Saver>()("test/Saver", {
  state: State,
  initialState: { clicks: 0, saved: 0 },
  actions: {
    saveClicked: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      clicks: state.clicks + 1,
    })),
    saved: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      saved: state.saved + 1,
    })),
  },
  selectors: {},
}) {}

class Gate extends Context.Service<Gate, Deferred.Deferred<void>>()("test/Gate") {
  static readonly layer = Layer.effect(Gate, Deferred.make<void>())
}

const saving = Store.afterLeading(Saver.actions.saveClicked, (_payload, _state, send) =>
  Effect.flatMap(Effect.service(Gate), (gate) =>
    Effect.andThen(Deferred.await(gate), send(Saver.actions.saved, undefined)),
  ),
)

describe("a reaction marked leading", () => {
  it.effect(
    "refuses the same command while its work runs, says why, and takes it again after",
    () =>
      Effect.gen(function* () {
        const built = yield* Layer.build(Saver.layer([saving]).pipe(Layer.provideMerge(Gate.layer)))
        const saver = Context.get(built, Saver)
        const gate = Context.get(built, Gate)

        yield* saver.commands.saveClicked()
        yield* saver.commands.saveClicked()

        expect(yield* saver.state.get).toEqual({ clicks: 1, saved: 0 })
        expect(yield* saver.refused.get).toEqual(
          Option.some({
            action: "saveClicked",
            reason: "what the last saveClicked started is still running",
            payload: null,
          }),
        )

        yield* Deferred.succeed(gate, undefined)
        yield* Effect.yieldNow
        yield* Effect.yieldNow
        expect(yield* saver.state.get).toEqual({ clicks: 1, saved: 1 })

        yield* saver.commands.saveClicked()
        expect((yield* saver.state.get).clicks).toBe(2)
      }).pipe(Effect.scoped),
  )
})
