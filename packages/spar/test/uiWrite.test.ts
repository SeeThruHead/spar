import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Reactive, State, UiState, compose } from "spar"
import * as Testing from "spar/testing"
import { OrdersView } from "./units.tsx"

const Counted = compose(
  Effect.fnUntraced(function* () {
    const count = yield* UiState.make("count", Schema.Finite, 0)

    yield* UiState.set(count, 2)
    yield* UiState.update(count, (now) => now + 1)

    return { status: Reactive.succeed("counted"), count }
  }),
)(OrdersView)

describe("a UI state write", () => {
  it.live("can be carried out inside an Effect, not only handed to a handler", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Counted)
      yield* Testing.eventually(() =>
        expect(document.querySelector('[aria-label="Orders count"]')?.textContent).toBe("3"),
      )
    }).pipe(Effect.provide(State.layer)),
  )
})
