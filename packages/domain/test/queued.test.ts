import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref, Schema, Stream } from "effect"
import { SecureRandom } from "effect/crypto"
import { KeyValueStore } from "effect/persistence"
import { Outbox, Reactive, State } from "spar"
import * as Aggregates from "../src/index.ts"
import { Counter, Increment, ResetInProgress } from "./counter.ts"

const alone: Outbox.Environment = {
  online: Reactive.succeed(true),
  ownership: Effect.void,
  announce: Effect.void,
  announced: Stream.empty,
}

const layers = Layer.mergeAll(
  Outbox.Outbox.layerWith({ maxAttempts: 4, attemptTimeout: "2 seconds" }).pipe(
    Layer.provide(Layer.succeed(Outbox.Environment, alone)),
    Layer.provide(KeyValueStore.layerMemory),
  ),
  State.layer,
  SecureRandom.layerWebCrypto,
)

type Answer = "commit" | "refuse" | "drop"

class Dropped extends Schema.TaggedError<Dropped, { readonly brand: unique symbol }>()(
  "RpcClientError",
  {},
) {}

type Refusal = ResetInProgress | Dropped

const at = (count: number) => ({ count, phase: "idle" as const })

const server = Effect.fnUntraced(function* (answers: ReadonlyArray<Answer>) {
  const count = yield* Ref.make(0)
  const calls = yield* Ref.make<ReadonlyArray<string>>([])
  const answer = (commandId: string) =>
    Effect.flatMap(
      Ref.modify(calls, (all) => [answers[all.length] ?? "commit", [...all, commandId]]),
      (now): Effect.Effect<{ readonly stream: string; readonly version: number }, Refusal> => {
        if (now === "refuse") return Effect.fail(new ResetInProgress())
        if (now === "drop") return Effect.fail(new Dropped())

        return Effect.map(
          Ref.updateAndGet(count, (n) => n + 1),
          (version) => ({
            stream: "Counter/q",
            version,
          }),
        )
      },
    )
  const over = {
    aggregate: Counter,
    view: {
      get: () => Effect.map(Ref.get(count), at),
      watch: () => Stream.empty,
    },
    commands: {
      Increment: (_command: unknown, options: { readonly commandId: string }) =>
        answer(options.commandId),
      Reset: (_command: unknown, options: { readonly commandId: string }) =>
        answer(options.commandId),
      FinishReset: (_command: unknown, options: { readonly commandId: string }) =>
        answer(options.commandId),
    },
  }

  return { over, calls }
})

const settled = Effect.gen(function* () {
  const outbox = yield* Outbox.Outbox

  yield* Effect.timeout(
    Stream.runHead(Stream.filter(outbox.pending.changes, (waiting) => waiting === 0)),
    "5 seconds",
  )
})

describe("a queued command", () => {
  it.live("is saved, then delivered once with the outbox's key as its commandId", () =>
    Effect.gen(function* () {
      const { over, calls } = yield* server(["commit"])
      const counter = yield* Aggregates.remote(over, "q")
      const queue = yield* counter.queued

      yield* queue(new Increment({ counterId: "q" }))
      yield* settled

      expect(yield* counter.state.get).toEqual(at(1))
      expect(yield* Ref.get(calls)).toHaveLength(1)
    }).pipe(Effect.provide(layers), Effect.scoped),
  )

  it.live("is sent again under the same commandId when the connection drops", () =>
    Effect.gen(function* () {
      const { over, calls } = yield* server(["drop", "commit"])
      const counter = yield* Aggregates.remote(over, "q")
      const queue = yield* counter.queued

      yield* queue(new Increment({ counterId: "q" }))
      yield* settled

      const sent = yield* Ref.get(calls)

      expect(sent).toHaveLength(2)
      expect(new Set(sent).size).toBe(1)
      expect(yield* counter.state.get).toEqual(at(1))
    }).pipe(Effect.provide(layers), Effect.scoped),
  )

  it.live("that the aggregate refuses is recorded once and not retried", () =>
    Effect.gen(function* () {
      const { over, calls } = yield* server(["refuse"])
      const counter = yield* Aggregates.remote(over, "q")
      const queue = yield* counter.queued

      yield* queue(new Increment({ counterId: "q" }))
      yield* settled

      expect(yield* Ref.get(calls)).toHaveLength(1)
      expect(yield* counter.state.get).toEqual(at(0))
    }).pipe(Effect.provide(layers), Effect.scoped),
  )
})
