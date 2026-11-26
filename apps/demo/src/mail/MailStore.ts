import { Context, Effect, Layer, Schema } from "effect"
import { Outbox, Store } from "spar"
import { MailApi } from "../server/MailApi.ts"

export const Reply = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  text: Schema.String,
})

export type Reply = typeof Reply.Type

const Draft = Schema.Struct({ threadId: Schema.String, text: Schema.String })

type Draft = typeof Draft.Type

const State = Schema.Struct({ nextId: Schema.Int, replies: Schema.Array(Reply) })

type State = typeof State.Type

const initialState: State = { nextId: 1, replies: [] }

export class MailStore extends Store.Tag<MailStore>()("demo/mail/MailStore", {
  state: State,
  initialState,
  actions: {
    replySent: Store.action(Draft, (state: State, { threadId, text }) => ({
      nextId: state.nextId + 1,
      replies: [...state.replies, { id: `reply-${state.nextId}`, threadId, text }],
    })),
  },
  selectors: {
    replies: Store.selector(Schema.Array(Reply), (state: State) => state.replies),
  },
}) {}

export class Replies extends Context.Service<
  Replies,
  { readonly send: (draft: Draft) => Effect.Effect<void> }
>()("demo/mail/Replies") {
  static readonly layer = Layer.effect(
    Replies,
    Effect.gen(function* () {
      const store = yield* MailStore
      const api = yield* MailApi
      const queued = yield* Outbox.channel("demo/mail/replies", Draft, (draft, idempotencyKey) =>
        api.sendReply({ ...draft, idempotencyKey }),
      )

      return Replies.of({
        send: Effect.fn("Replies.send")(function* (draft: Draft) {
          yield* store.commands.replySent(draft)
          yield* queued(draft)
        }),
      })
    }),
  )
}

export const MailStoreLive = Replies.layer.pipe(Layer.provideMerge(MailStore.layerSaved))
