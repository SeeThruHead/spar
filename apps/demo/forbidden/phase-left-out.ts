import { Schema } from "effect"
import { Store } from "spar"

const State = Schema.Struct({ phase: Schema.Literals(["idle", "sending", "sent"]) })

type State = typeof State.Type

const initialState: State = { phase: "idle" }

export class Mail extends Store.Tag<Mail>()("forbidden/Mail", {
  state: State,
  initialState,
  actions: {
    sendClicked: Store.action(Schema.Void, (): State => ({ phase: "sending" })),
    delivered: Store.action(Schema.Void, (): State => ({ phase: "sent" })),
  },
  selectors: {},
  phases: {
    of: (state) => state.phase,
    accepts: {
      idle: ["sendClicked"],
      sending: ["delivered"],
    },
  },
}) {}
