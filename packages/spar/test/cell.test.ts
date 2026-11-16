import { describe, expect, it } from "@effect/vitest"
import * as Cell from "../src/internal/cell.ts"

const heard = () => {
  const cell = Cell.make(0)
  const log = Cell.make<ReadonlyArray<string>>([])
  const note = (who: string) => (value: number) => log.write([...log.read(), `${who} ${value}`])

  return { cell, log, note }
}

describe("cells", () => {
  it("nobody listening is fine, and one listener hears each new value once", () => {
    const { cell, log, note } = heard()

    cell.write(1)

    const stop = cell.subscribe(note("first"))

    cell.write(2)
    cell.write(2)
    stop()
    stop()
    cell.write(3)

    expect(log.read()).toEqual(["first 2"])
    expect(cell.read()).toBe(3)
  })

  it("several listeners all hear, and each stops on its own", () => {
    const { cell, log, note } = heard()
    const stopFirst = cell.subscribe(note("first"))
    const stopSecond = cell.subscribe(note("second"))
    const stopThird = cell.subscribe(note("third"))

    cell.write(1)
    stopSecond()
    cell.write(2)
    stopFirst()
    stopThird()
    cell.write(3)

    expect(log.read()).toEqual(["first 1", "second 1", "third 1", "first 2", "third 2"])
  })

  it("stopping a listener that is the only one left of two leaves the other", () => {
    const { cell, log, note } = heard()
    const stopFirst = cell.subscribe(note("first"))

    cell.subscribe(note("second"))
    stopFirst()
    stopFirst()
    cell.write(1)

    expect(log.read()).toEqual(["second 1"])
  })

  it("everything an owner holds is stopped once when it is released", () => {
    const { cell, log, note } = heard()
    const owner = Cell.owner()

    Cell.own(owner, cell.subscribe(note("owned")))
    cell.write(1)
    Cell.release(owner)
    Cell.release(owner)
    cell.write(2)

    expect(log.read()).toEqual(["owned 1"])
  })
})
