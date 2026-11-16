import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { settled } from "../src/internal/order.ts"

const sorted = (set: ReadonlySet<number>): ReadonlyArray<number> =>
  [...set].toSorted((left, right) => left - right)

const valuesAt = (order: ReadonlyArray<number>, positions: ReadonlySet<number>) =>
  sorted(positions).map((position) => order[position])

const longestAscending = (order: ReadonlyArray<number>): number =>
  order
    .reduce<ReadonlyArray<number>>(
      (best, value, index) => [
        ...best,
        1 +
          Math.max(
            0,
            ...best.filter((_, earlier) => (order[earlier] ?? value) < value && earlier < index),
          ),
      ],
      [],
    )
    .reduce((longest, length) => Math.max(longest, length), 0)

describe("which rows stay put when a keyed list is reordered", () => {
  it("every row stays when the order did not change", () => {
    expect(sorted(settled([0, 1, 2, 3]))).toEqual([0, 1, 2, 3])
    expect(sorted(settled([]))).toEqual([])
  })

  it("a swap of two rows moves only those two", () => {
    expect(valuesAt([0, 4, 2, 3, 1, 5], settled([0, 4, 2, 3, 1, 5]))).toEqual([0, 2, 3, 5])
  })

  it("a reversed list keeps one row and moves the rest", () => {
    expect(settled([3, 2, 1, 0]).size).toBe(1)
  })

  it("a row moved to the front is the only one that moves", () => {
    expect(valuesAt([4, 0, 1, 2, 3], settled([4, 0, 1, 2, 3]))).toEqual([0, 1, 2, 3])
  })

  it.prop(
    "the rows that stay are in ascending order and no longer run exists",
    [Schema.Array(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 40 })))],
    ([values]) => {
      const order = [...new Set(values)]
      const kept = valuesAt(order, settled(order))

      expect(kept).toEqual(kept.toSorted((left, right) => (left ?? 0) - (right ?? 0)))
      expect(kept.length).toBe(longestAscending(order))
    },
  )
})
