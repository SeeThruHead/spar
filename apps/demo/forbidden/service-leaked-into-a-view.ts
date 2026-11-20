import { Effect } from "effect"
import { View } from "spar"
import { CounterStore } from "../src/counter/CounterStore.ts"
import { CounterView } from "./fixtures/CounterView.tsx"

export const Counter = View.connect(
  Effect.fnUntraced(function* () {
    const store = yield* CounterStore

    return {
      count: store.select.count,
      doubled: store.select.doubled,
      onIncrement: store.commands.incremented({ by: 1 }),
      onReset: store.commands.reset(),
      store,
    }
  }),
)(CounterView)
