import { Context, Duration, Effect, Layer, Option, Schedule, Schema, SubscriptionRef } from "effect"
import { KeyValueStore } from "effect/persistence"
import { fromSubscriptionRef } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"

const Stored = Schema.Struct({ channel: Schema.String, payload: Schema.Json })

export type Entry = {
  readonly key: string
  readonly channel: string
  readonly payload: Schema.Json
}

export const retryPolicy = Schedule.exponential("250 millis").pipe(
  Schedule.modifyDelay((metadata) =>
    Effect.succeed(Duration.min(metadata.duration, Duration.seconds(5))),
  ),
)

export class Outbox extends Context.Service<
  Outbox,
  {
    readonly persist: (entry: Entry) => Effect.Effect<void>
    readonly deliver: <E, R>(
      key: string,
      send: Effect.Effect<void, E, R>,
    ) => Effect.Effect<void, never, R>
    readonly persisted: (channel: string) => Effect.Effect<ReadonlyArray<Entry>>
    readonly pending: Reactive<number>
  }
>()("spar/Outbox") {
  static readonly layer = Layer.effect(
    Outbox,
    Effect.gen(function* () {
      const keyValueStore = yield* KeyValueStore.KeyValueStore
      const store = KeyValueStore.toSchemaStore(
        KeyValueStore.prefix(keyValueStore, "spar/outbox/"),
        Stored,
      )
      const pending = yield* SubscriptionRef.make((yield* Effect.orDie(store.keys)).length)

      const persist = Effect.fn("Outbox.persist")(function* (entry: Entry) {
        yield* store.set(entry.key, { channel: entry.channel, payload: entry.payload })
        yield* SubscriptionRef.update(pending, (count) => count + 1)
      }, Effect.orDie)

      const confirm = Effect.fn("Outbox.confirm")(function* (key: string) {
        yield* store.remove(key)
        yield* SubscriptionRef.update(pending, (count) => count - 1)
      }, Effect.orDie)

      const deliver = <E, R>(key: string, send: Effect.Effect<void, E, R>) =>
        send.pipe(
          Effect.timeout("10 seconds"),
          Effect.retry(retryPolicy),
          Effect.orDie,
          Effect.andThen(confirm(key)),
          Effect.withSpan("Outbox.deliver", { attributes: { "outbox.key": key } }),
        )

      const read = Effect.fnUntraced(function* (key: string) {
        const stored = yield* store.get(key)

        return Option.map(stored, ({ channel, payload }): Entry => ({ key, channel, payload }))
      })

      const persisted = Effect.fn("Outbox.persisted")(function* (channel: string) {
        const keys = yield* store.keys
        const entries = yield* Effect.forEach(keys, read)

        return entries.flatMap(Option.toArray).filter((entry) => entry.channel === channel)
      }, Effect.orDie)

      return Outbox.of({ persist, deliver, persisted, pending: fromSubscriptionRef(pending) })
    }),
  )
}
