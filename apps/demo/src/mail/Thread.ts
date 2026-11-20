import { Effect, pipe, Schema } from "effect"
import { Events, Outbox, Reactive, UiState, View, compose, withProps } from "spar"
import { MailApi, ThreadLoadFailed } from "../server/MailApi.ts"
import { MailStore, Replies } from "./MailStore.ts"
import type { Reply } from "./MailStore.ts"
import {
  MailView,
  ReplyView,
  ThreadErrorView,
  ThreadMenuView,
  ThreadSkeletonView,
  ThreadView,
} from "./ThreadView.tsx"

const threadProps = Effect.fnUntraced(function* ({ id }: { readonly id: string }) {
  const api = yield* MailApi
  const store = yield* MailStore
  const sending = yield* Replies
  const outbox = yield* Outbox.Outbox
  const thread = yield* api.loadThread(id)
  const menuOpen = yield* UiState.make("menuOpen", Schema.Boolean, false)
  const status = yield* UiState.make("status", Schema.String, "In inbox")
  const draft = yield* UiState.make("draft", Schema.String, "")
  const pick = (label: string) => [UiState.set(status, label), UiState.set(menuOpen, false)]

  yield* Events.onDocument("pointerdown", UiState.set(menuOpen, false))
  yield* Events.onDocument("keydown", (event) =>
    event.key === "Escape" ? UiState.set(menuOpen, false) : [],
  )

  const menu = yield* pipe(
    menuOpen,
    Reactive.when(ThreadMenuView, {
      onArchive: pick("Archived"),
      onMarkUnread: pick("Unread"),
    }),
  )

  const replies = yield* pipe(
    Reactive.map(store.select.replies, (all) => all.filter((reply) => reply.threadId === id)),
    Reactive.mapBy(
      (reply: Reply) => reply.id,
      ReplyView,
      (reply) => ({ reply }),
    ),
  )

  return {
    subject: thread.subject,
    messages: thread.messages,
    status,
    menuOpen,
    menu,
    draft,
    replies,
    unsent: outbox.pending,
    onSend: [
      Effect.flatMap(draft.get, (text) => sending.send({ threadId: id, text })),
      UiState.set(draft, ""),
    ],
  }
})

export const Thread = pipe(
  compose(withProps({ id: Schema.String }), threadProps)(ThreadView),
  View.recover(ThreadLoadFailed, ThreadErrorView),
  View.pending(ThreadSkeletonView),
)

export const Mail = compose(
  Effect.fnUntraced(function* () {
    return {
      welcome: yield* View.child(Thread, { id: "welcome" }),
      missing: yield* View.child(Thread, { id: "missing" }),
    }
  }),
)(MailView)
