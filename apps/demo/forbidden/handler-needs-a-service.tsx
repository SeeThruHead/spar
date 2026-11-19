import { Effect } from "effect"
import { View } from "spar"
import { CounterStore } from "../src/counter/CounterStore.ts"

const increment = Effect.gen(function* () {
  const store = yield* CounterStore

  yield* store.commands.incremented({ by: 1 })
})

export const ButtonView = View.make("ButtonView", {}, () => (
  <button onClick={increment}>Add one</button>
))
