import { Effect, Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

export class Tally extends Store.Tag<Tally>()("forbidden/RefusingTally", {
  state: State,
  initialState: { count: 0 },
  actions: {
    added: Store.action(Schema.Void, (state: State): State => ({ count: state.count + 1 })),
  },
  selectors: {},
  tasks: {
    reset: Store.task(Schema.Void, {
      result: Schema.Void,
      run: () => Effect.sleep("1 second"),
      finish: (): State => ({ count: 0 }),
      refuses: ["addded"],
    }),
  },
}) {}
