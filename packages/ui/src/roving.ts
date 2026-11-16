import { Array, Option } from "effect"
import { Handle } from "spar"
import type { Action } from "spar"

const moves: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowDown: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowUp: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
}

export const target = (key: string, index: number, count: number): Option.Option<number> =>
  Option.map(Option.fromNullishOr(moves[key]), (move) => move(index, count))

export const focusAt = (handles: ReadonlyArray<Handle.Handle>, index: number): Action =>
  Option.toArray(Array.get(handles, index)).map(Handle.focus)
