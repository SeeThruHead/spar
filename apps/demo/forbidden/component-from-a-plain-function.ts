import { Effect } from "effect"
import { View } from "spar"
import type { Element } from "spar"

declare const drawn: Element

export const Loose = View.connect(() => Effect.succeed({ title: "Loose" }))(
  ({ title }: { readonly title: string }) => (title === "" ? drawn : drawn),
)
