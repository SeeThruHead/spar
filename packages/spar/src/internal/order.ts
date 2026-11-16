import { Array, HashMap, Option } from "effect"

type Tail = { readonly position: number; readonly value: number }

type Search = {
  readonly tails: HashMap.HashMap<number, Tail>
  readonly previous: HashMap.HashMap<number, number>
  readonly length: number
}

const start: Search = { tails: HashMap.empty(), previous: HashMap.empty(), length: 0 }

const slotFor = (search: Search, value: number, low: number, high: number): number => {
  if (low >= high) return low

  const middle = (low + high) >> 1

  return HashMap.getUnsafe(search.tails, middle).value < value
    ? slotFor(search, value, middle + 1, high)
    : slotFor(search, value, low, middle)
}

const linked = (search: Search, slot: number, position: number): Search["previous"] => {
  if (slot === 0) return search.previous

  return HashMap.set(search.previous, position, HashMap.getUnsafe(search.tails, slot - 1).position)
}

const step = (search: Search, value: number, position: number): Search => {
  const slot = slotFor(search, value, 0, search.length)

  return {
    tails: HashMap.set(search.tails, slot, { position, value }),
    previous: linked(search, slot, position),
    length: Math.max(search.length, slot + 1),
  }
}

const chain = (search: Search): ReadonlyArray<number> =>
  Array.unfold(
    Option.map(HashMap.get(search.tails, search.length - 1), (tail) => tail.position),
    Option.map((position) => [position, HashMap.get(search.previous, position)] as const),
  )

const isAscending = (order: ReadonlyArray<number>): boolean =>
  Array.zip(order, order.slice(1)).every(([before, after]) => before < after)

export const settled = (order: ReadonlyArray<number>): ReadonlySet<number> => {
  if (isAscending(order)) return new Set(order.keys())

  return new Set(chain(order.reduce(step, start)))
}
