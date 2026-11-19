import { Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({ cards: Schema.Array(Schema.String) })

export class Board extends Store.Tag<Board>()("forbidden/Board", {
  state: State,
  initialState: { cards: [] },
  actions: {
    removed: Store.action(Schema.Struct({ id: Schema.String }), (state, { id }) => ({
      cards: [String(state), id],
    })),
  },
  selectors: {},
}) {}
