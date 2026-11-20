import { Duration, Effect, FiberHandle, Schema } from "effect"
import { Model, Store } from "spar"

const State = Schema.Struct({
  count: Schema.Int,
  resetting: Schema.Boolean,
})

type State = typeof State.Type

const initialState: State = { count: 0, resetting: false }

export class CounterStore extends Model.Tag<CounterStore>()("Counter", {
  state: State,
  initialState,
  actions: {
    incremented: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      count: state.count + 1,
    })),
    resetClicked: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      resetting: true,
    })),
    resetCompleted: Store.action(Schema.Void, (_state: State): State => initialState),
  },
  selectors: {
    count: Store.selector(Schema.Int, (state: State) => state.count),
    resetting: Store.selector(Schema.Boolean, (state: State) => state.resetting),
  },
}) {}

export const withReset = Effect.fnUntraced(function* () {
  const store = yield* CounterStore
  const running = yield* FiberHandle.make()
  const reset = Effect.gen(function* () {
    yield* store.commands.resetClicked()
    yield* Effect.sleep(Duration.seconds(2))
    yield* store.commands.resetCompleted()
  })

  return { onReset: Effect.asVoid(FiberHandle.run(running, reset, { onlyIfMissing: true })) }
})
