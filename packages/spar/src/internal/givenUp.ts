export type GivenUp = { readonly key: string; readonly channel: string }

export const newIn = (
  seen: ReadonlySet<string>,
  now: ReadonlyArray<GivenUp>,
  channel: string,
): readonly [ReadonlySet<string>, ReadonlyArray<true>] => {
  const keys = now.filter((entry) => entry.channel === channel).map((entry) => entry.key)

  return [new Set(keys), keys.some((key) => !seen.has(key)) ? [true] : []]
}
