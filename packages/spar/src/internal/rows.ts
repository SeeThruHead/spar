type Change = { readonly from: ReadonlyArray<unknown>; readonly index: number }

const changes = new WeakMap<ReadonlyArray<unknown>, Change>()

export const withRow = <A>(rows: ReadonlyArray<A>, index: number, row: A): ReadonlyArray<A> => {
  const next = rows.with(index, row)

  changes.set(next, { from: rows, index })

  return next
}

export const changedOne = <A>(
  shown: ReadonlyArray<A>,
  next: ReadonlyArray<A>,
): number | undefined => {
  const change = changes.get(next)

  return change?.from === shown ? change.index : undefined
}
