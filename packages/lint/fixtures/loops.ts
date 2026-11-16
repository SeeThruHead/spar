export const count = (items: ReadonlyArray<number>) => {
  const seen = [0]
  for (const item of items) seen.push(item)
  return seen
}
