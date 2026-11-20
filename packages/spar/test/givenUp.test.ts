import { describe, expect, it } from "@effect/vitest"
import { newIn } from "../src/internal/givenUp.ts"

const mail = (key: string) => ({ key, channel: "mail" })

describe("sends the outbox gave up on", () => {
  it("are news only on their own channel, and only once", () => {
    const [seen, first] = newIn(new Set(), [mail("a"), { key: "b", channel: "chat" }], "mail")

    expect([[...seen], first]).toEqual([["a"], [true]])

    const [again, second] = newIn(seen, [mail("a")], "mail")

    expect([[...again], second]).toEqual([["a"], []])
    expect(newIn(again, [mail("a"), mail("c")], "mail")[1]).toEqual([true])
    expect(newIn(again, [], "mail")).toEqual([new Set(), []])
  })
})
