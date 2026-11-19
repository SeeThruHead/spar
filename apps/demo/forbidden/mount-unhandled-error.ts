import { Effect } from "effect"
import { App, View } from "spar"
import { MailApi } from "../src/server/MailApi.ts"
import { ThreadSkeletonView } from "../src/mail/ThreadView.tsx"

const Thread = View.connect(
  Effect.fnUntraced(function* () {
    const api = yield* MailApi
    const thread = yield* api.loadThread("welcome")

    return { id: thread.id }
  }),
)(ThreadSkeletonView)

export const program = App.mount(Thread, { target: document.body, layer: MailApi.layer })
