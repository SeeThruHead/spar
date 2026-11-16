export const sortInPlace = (xs: Array<number>, target: { count: number }) => {
  xs.sort((a, b) => a - b)
  target.count = 1
  Object.assign(target, { count: 2 })
  return xs
}
export class Counter {
  count: number
  constructor(start: number) {
    this.count = start
  }
  bump(): void {
    this.count = this.count + 1
  }
}
