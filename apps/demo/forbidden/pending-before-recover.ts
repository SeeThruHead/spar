import { Effect, Schema, pipe } from "effect"
import { View, compose, withProps } from "spar"
import { MailApi } from "../src/server/MailApi.ts"
import { ThreadSkeletonView } from "../src/mail/ThreadView.tsx"

const threadProps = Effect.fnUntraced(function* ({ id }: { readonly id: string }) {
  const api = yield* MailApi
  const thread = yield* api.loadThread(id)

  return { id: thread.id }
})

export const Waiting = pipe(
  compose(withProps({ id: Schema.String }), threadProps)(ThreadSkeletonView),
  View.pending(ThreadSkeletonView),
)
