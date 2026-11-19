import { Effect, Schema, flow } from "effect"
import { View } from "spar"
import { MailApi } from "../src/mail/MailApi.ts"
import { ThreadSkeletonView } from "../src/mail/ThreadView.tsx"

const threadProps = Effect.fnUntraced(function* ({ id }: { readonly id: string }) {
  const api = yield* MailApi
  const thread = yield* api.loadThread(id)

  return { id: thread.id }
})

export const Waiting = flow(
  View.taking({ id: Schema.String }, threadProps),
  View.pending(ThreadSkeletonView),
)(ThreadSkeletonView)
