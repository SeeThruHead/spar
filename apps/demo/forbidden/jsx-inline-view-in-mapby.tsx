import { Reactive } from "spar"

export const rows = Reactive.mapBy(
  (item: string) => item,
  ({ item }: { readonly item: Reactive.Reactive<string> }) => <li>{item}</li>,
  (item) => ({ item }),
)
