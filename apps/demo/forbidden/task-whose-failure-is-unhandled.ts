import { Effect, Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({ saved: Schema.Boolean })

type State = typeof State.Type

export class Draft extends Store.Tag<Draft>()("forbidden/Draft", {
  state: State,
  initialState: { saved: false },
  actions: {},
  selectors: {},
  tasks: {
    save: Store.task(Schema.Void, {
      result: Schema.Void,
      run: () => Effect.fail("the server is down"),
      finish: (): State => ({ saved: true }),
    }),
  },
}) {}
