import { Effect, Schema } from "effect"
import { Store } from "spar"
import { MailApi } from "./MailApi.ts"

export const Reply = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  text: Schema.String,
})

export type Reply = typeof Reply.Type

const State = Schema.Struct({ nextId: Schema.Int, replies: Schema.Array(Reply) })

type State = typeof State.Type

const initialState: State = { nextId: 1, replies: [] }

export class MailStore extends Store.Tag<MailStore>()("demo/mail/MailStore", {
  state: State,
  initialState,
  actions: {
    replySent: Store.action(
      Schema.Struct({ threadId: Schema.String, text: Schema.String }),
      (state: State, { threadId, text }) => ({
        nextId: state.nextId + 1,
        replies: [...state.replies, { id: `reply-${state.nextId}`, threadId, text }],
      }),
    ),
  },
  selectors: {
    replies: Store.selector(Schema.Array(Reply), (state: State) => state.replies),
  },
}) {}

export const MailStoreLive = MailStore.layer([
  Store.outbox(
    MailStore.actions.replySent,
    Effect.fnUntraced(function* (reply, idempotencyKey) {
      const api = yield* MailApi

      yield* api.sendReply({ ...reply, idempotencyKey })
    }),
  ),
])
