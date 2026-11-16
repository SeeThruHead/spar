import { Effect, Schema } from "effect"
import { Store } from "spar"
import { MailApi } from "./MailApi.ts"

export type Reply = {
  readonly id: string
  readonly threadId: string
  readonly text: string
}

type State = {
  readonly nextId: number
  readonly replies: ReadonlyArray<Reply>
}

const initialState: State = { nextId: 1, replies: [] }

export class MailStore extends Store.Tag<MailStore>()("demo/mail/MailStore", {
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
    replies: (state) => state.replies,
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
