import { Effect } from "effect"
import { compose } from "spar"
import { CounterView } from "./fixtures/CounterView.tsx"

export const Counter = compose(({ start }: { readonly start: number }) =>
  Effect.succeed({ start }),
)(CounterView)
