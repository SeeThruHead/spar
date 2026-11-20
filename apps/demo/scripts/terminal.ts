import { Console, Effect, Layer } from "effect"
import { App, State } from "spar"
import * as Terminal from "spar/renderer/terminal"
import { Counter } from "../src/counter/Counter.tsx"
import { CounterStore } from "../src/counter/CounterStore.ts"

const program = Effect.gen(function* () {
  const store = yield* Layer.build(CounterStore.layer.pipe(Layer.provideMerge(State.layer)))
  const counter = yield* Effect.provide(Effect.service(CounterStore), store)

  yield* Effect.forkScoped(
    App.mount(Counter, {
      layer: Layer.merge(
        Layer.succeedContext(store),
        Terminal.layer((frame) => Console.log(`${frame}\n--`)),
      ),
    }),
  )
  yield* Effect.sleep("50 millis")
  yield* counter.commands.incremented({ by: 1 })
  yield* Effect.sleep("50 millis")
  yield* counter.commands.incremented({ by: 2 })
  yield* Effect.sleep("50 millis")
})

await Effect.runPromise(Effect.scoped(program))
