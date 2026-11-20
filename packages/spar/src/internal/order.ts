import { Array, Option } from "effect"

type Node<A> = {
  readonly value: Option.Option<A>
  readonly below: ReadonlyArray<Trie<A>>
}

type Trie<A> = Node<A> | undefined

const width = 32

const empty: ReadonlyArray<undefined> = Array.replicate(undefined, width)

const found = <A>(trie: Trie<A>, key: number): Option.Option<A> => {
  if (trie === undefined) return Option.none()
  if (key === 0) return trie.value

  return found(trie.below[key % width], Math.floor(key / width))
}

const placed = <A>(trie: Trie<A>, key: number, value: A): Trie<A> => {
  const here: Node<A> = trie ?? { value: Option.none(), below: empty }

  if (key === 0) return { ...here, value: Option.some(value) }

  const slot = key % width

  return {
    ...here,
    below: here.below.with(slot, placed(here.below[slot], Math.floor(key / width), value)),
  }
}

type Tail = { readonly position: number; readonly value: number }

type Search = {
  readonly tails: Trie<Tail>
  readonly previous: Trie<number>
  readonly length: number
}

const start: Search = { tails: undefined, previous: undefined, length: 0 }

const tailAt = (search: Search, slot: number): Tail => Option.getOrThrow(found(search.tails, slot))

const slotFor = (search: Search, value: number, low: number, high: number): number => {
  if (low >= high) return low

  const middle = (low + high) >> 1

  return tailAt(search, middle).value < value
    ? slotFor(search, value, middle + 1, high)
    : slotFor(search, value, low, middle)
}

const linked = (search: Search, slot: number, position: number): Search["previous"] => {
  if (slot === 0) return search.previous

  return placed(search.previous, position, tailAt(search, slot - 1).position)
}

const step = (search: Search, value: number, position: number): Search => {
  const slot = slotFor(search, value, 0, search.length)

  return {
    tails: placed(search.tails, slot, { position, value }),
    previous: linked(search, slot, position),
    length: Math.max(search.length, slot + 1),
  }
}

const chain = (search: Search): ReadonlyArray<number> =>
  Array.unfold(
    Option.map(found(search.tails, search.length - 1), (tail) => tail.position),
    Option.map((position) => [position, found(search.previous, position)] as const),
  )

const isAscending = (order: ReadonlyArray<number>): boolean =>
  Array.zip(order, order.slice(1)).every(([before, after]) => before < after)

export const settled = (order: ReadonlyArray<number>): ReadonlySet<number> => {
  if (isAscending(order)) return new Set(order.keys())

  return new Set(chain(order.reduce(step, start)))
}
