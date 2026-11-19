import { Effect } from "effect"
import { View } from "spar"
import { CounterView } from "../src/counter/CounterView.tsx"

export const Counter = View.connect(({ start }: { readonly start: number }) =>
  Effect.succeed({ start }),
)(CounterView)
