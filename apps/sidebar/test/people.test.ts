import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Ref } from "effect"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { Timeline } from "spar"
import { PeopleStore, UsersQuery, csvOf, exportsCsv } from "../src/People.ts"
import { people } from "../src/api.ts"
import { Server } from "../src/server/Server.ts"

const opened = Effect.gen(function* () {
  const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
  const built = yield* Layer.build(
    PeopleStore.layer([exportsCsv]).pipe(
      Layer.provideMerge(UsersQuery.live),
      Layer.provide(
        Layer.mergeAll(
          Server.layer,
          SecureRandom.layerWebCrypto,
          Layer.succeed(
            Timeline.Recorder,
            Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
          ),
        ),
      ),
    ),
  )

  return {
    built,
    noted,
    users: yield* Effect.provide(Effect.service(UsersQuery), built),
    store: yield* Effect.provide(Effect.service(PeopleStore), built),
  }
})

describe("people: server data in a store, used by another store's action", () => {
  it.effect("Export CSV takes only the selection and reads the emails from the users store", () =>
    Effect.gen(function* () {
      const { built, noted, users, store } = yield* opened

      yield* Effect.provide(UsersQuery.ensure, built)
      yield* TestClock.adjust("40 millis")
      expect(yield* users.select.value.get).toEqual(people)

      yield* store.commands.toggled(123)
      yield* store.commands.toggled(124)
      yield* store.commands.toggled(121)
      yield* store.commands.toggled(124)
      yield* Effect.withSpan(store.commands.exportRequested(), "a click on Export CSV")
      yield* Effect.yieldNow

      expect(yield* store.select.csv.get).toBe(
        "name,email\nAda Lovelace,ada@example.com\nAlan Turing,alan@example.com",
      )
      expect(yield* store.select.download.get).toContain("data:text/csv;charset=utf-8,name%2Cemail")

      const moments = yield* Ref.get(noted)
      const asked = moments.find((seen) => seen.name === "sidebar/People/exportRequested")
      const made = moments.find((seen) => seen.name === "sidebar/People/exported")

      expect(asked?.traceId).toHaveLength(32)
      expect(made?.traceId).toBe(asked?.traceId)
    }),
  )

  it.effect("with nobody selected the export is refused, and nothing is produced", () =>
    Effect.gen(function* () {
      const { store } = yield* opened

      yield* store.commands.exportRequested()
      yield* Effect.yieldNow

      expect(yield* store.refused.get).toEqual(
        Option.some({
          action: "exportRequested",
          reason: "Select at least one person first",
          payload: null,
        }),
      )
      expect([yield* store.select.csv.get, yield* store.select.download.get]).toEqual(["", ""])
    }),
  )

  it("the file has a header and one line for each selected person, in the table's order", () => {
    expect(csvOf(people, [])).toBe("name,email")
    expect(csvOf(people, [124, 122])).toBe(
      "name,email\nGrace Hopper,grace@example.com\nEdsger Dijkstra,edsger@example.com",
    )
  })
})
