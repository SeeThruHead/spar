import { Context, Effect, HashSet, Layer, Ref, Schema } from "effect"

export class ThreadLoadFailed extends Schema.TaggedError<
  ThreadLoadFailed,
  { readonly brand: unique symbol }
>()("ThreadLoadFailed", {
  threadId: Schema.String,
  message: Schema.String,
}) {}

export class SendFailed extends Schema.TaggedError<SendFailed, { readonly brand: unique symbol }>()(
  "SendFailed",
  {
    message: Schema.String,
  },
) {}

export type Thread = {
  readonly id: string
  readonly subject: string
  readonly messages: ReadonlyArray<string>
}

const threads: ReadonlyArray<Thread> = [
  {
    id: "welcome",
    subject: "Welcome to the hangar",
    messages: ["Your bay is ready.", "Keys are at the front desk."],
  },
]

export class MailApi extends Context.Service<
  MailApi,
  {
    readonly loadThread: (id: string) => Effect.Effect<Thread, ThreadLoadFailed>
    readonly sendReply: (reply: {
      readonly threadId: string
      readonly text: string
      readonly idempotencyKey: string
    }) => Effect.Effect<void, SendFailed>
    readonly delivered: Effect.Effect<ReadonlyArray<string>>
  }
>()("demo/mail/MailApi") {
  static readonly layer = Layer.effect(
    MailApi,
    Effect.gen(function* () {
      const attempted = yield* Ref.make(HashSet.empty<string>())
      const delivered = yield* Ref.make<ReadonlyArray<string>>([])

      const loadThread = Effect.fn("MailApi.loadThread")(function* (id: string) {
        yield* Effect.sleep("400 millis")
        const thread = threads.find((candidate) => candidate.id === id)

        if (thread === undefined) {
          return yield* new ThreadLoadFailed({
            threadId: id,
            message: `The server has no thread called "${id}". Check the link and try again.`,
          })
        }

        return thread
      })

      const sendReply = Effect.fn("MailApi.sendReply")(function* (reply: {
        readonly threadId: string
        readonly text: string
        readonly idempotencyKey: string
      }) {
        const retried = yield* Ref.modify(attempted, (keys) => [
          HashSet.has(keys, reply.idempotencyKey),
          HashSet.add(keys, reply.idempotencyKey),
        ])

        if (!retried) {
          return yield* new SendFailed({ message: "The connection dropped. Sending again." })
        }

        yield* Ref.update(delivered, (texts) => [...texts, reply.text])
      })

      return MailApi.of({ loadThread, sendReply, delivered: Ref.get(delivered) })
    }),
  )
}
