import * as Domain from "@alchemy.run/domain"
import { Effect, Layer } from "effect"
import { Counter, CounterModel, Increment } from "../domain/counter.ts"

const program = Effect.gen(function* () {
  const counters = yield* Counter

  return yield* counters.send(new Increment({ counterId: "one" }))
})

Effect.runFork(
  Effect.provide(program, CounterModel.layer(Layer.empty).pipe(Layer.provide(Domain.InMemory))),
)
