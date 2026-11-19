import { Schema } from "effect"
import { Store } from "spar"

type State = { readonly count: number }

const initialState: State = { count: 0 }

export class Typed extends Store.Tag<Typed>()("forbidden/Typed", {
  initialState,
  actions: {
    reset: Store.action(Schema.Void, (): State => initialState),
  },
  selectors: {},
}) {}
