import { Effect } from "effect"
import type { Reactive } from "spar"

export const CountView = ({ count }: { readonly count: Reactive.Reactive<number> }) => (
  <output>{Effect.runSync(count.get)}</output>
)
