import { Effect, Ref } from "effect"
import { Agents, NoRecord, ServerUnreachable, people } from "../src/api.ts"
import type { Started } from "../src/api.ts"

export const AgentsLive = Agents.toLayer(
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<Started>>([])
    const attempts = yield* Ref.make(0)

    const start = Effect.fn("Agents.start")(function* (name: string, idempotencyKey: string) {
      const attempt = yield* Ref.updateAndGet(attempts, (count) => count + 1)

      yield* Effect.annotateCurrentSpan({ "agent.name": name, "idempotency.key": idempotencyKey })
      yield* Effect.sleep("50 millis")

      if (attempt % 2 === 1) return yield* new ServerUnreachable()

      yield* Ref.update(seen, (all) => [
        ...all.filter((known) => known.key !== idempotencyKey),
        { name, key: idempotencyKey },
      ])
    })

    const describe = Effect.fn("Agents.describe")(function* (name: string) {
      const all = yield* Ref.get(seen)

      return yield* Effect.mapError(
        Effect.fromNullishOr(all.findLast((known) => known.name === name)),
        () => new NoRecord({ agent: name }),
      )
    })

    return {
      Start: ({ name, idempotencyKey }) => start(name, idempotencyKey),
      Describe: ({ name }) => describe(name),
      Started: () => Effect.map(Ref.get(seen), (all) => all.map((known) => known.key)),
      Users: () =>
        Effect.as(Effect.sleep("40 millis"), people).pipe(Effect.withSpan("Agents.users")),
    }
  }),
)
