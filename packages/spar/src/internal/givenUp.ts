import { Context } from "effect"
import type { Reactive } from "./reactive.ts"

export type GivenUp = { readonly key: string; readonly channel: string }

export class GivenUpSends extends Context.Service<
  GivenUpSends,
  { readonly dead: Reactive<ReadonlyArray<GivenUp>> }
>()("spar/Outbox") {}

export const newIn = (
  seen: ReadonlySet<string>,
  now: ReadonlyArray<GivenUp>,
  channel: string,
): readonly [ReadonlySet<string>, ReadonlyArray<true>] => {
  const keys = now.filter((entry) => entry.channel === channel).map((entry) => entry.key)

  return [new Set(keys), keys.some((key) => !seen.has(key)) ? [true] : []]
}
