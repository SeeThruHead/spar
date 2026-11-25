import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, Ref } from "effect"
import { AsyncResult } from "effect/reactivity"
import { SecureRandom } from "effect/crypto"
import { TestClock } from "effect/testing"
import { State, Timeline } from "spar"
import { PeopleStore, UsersQuery, csvOf, exportCsv } from "../src/People.ts"
import { people } from "../src/api.ts"
import { Server } from "../src/server/Server.ts"

const opened = Effect.gen(function* () {
  const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
  const built = yield* Layer.build(
    PeopleStore.layer.pipe(
      Layer.provideMerge(UsersQuery.live),
      Layer.provideMerge(State.layer),
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
    store: yield* Effect.provide(Effect.service(PeopleStore), built),
  }
})

describe("people: server data in a store, used by another store's action", () => {
  it.effect("Export CSV takes only the selection and reads the emails from the users store", () =>
    Effect.gen(function* () {
      const { built, noted, store } = yield* opened
      const users = yield* Effect.provide(UsersQuery.ask(), built)

      yield* TestClock.adjust("40 millis")
      expect(Option.getOrNull(AsyncResult.value(yield* users.result.get))).toEqual(people)

      yield* store.commands.toggled(123)
      yield* store.commands.toggled(124)
      yield* store.commands.toggled(121)
      yield* store.commands.toggled(124)
      const clicked = yield* Effect.withSpan(
        Effect.flatMap(Effect.currentSpan, (span) =>
          Effect.as(Effect.provide(exportCsv(), built), span.traceId),
        ),
        "a click on Export CSV",
      )

      expect(yield* store.select.csv.get).toBe(
        "name,email\nAda Lovelace,ada@example.com\nAlan Turing,alan@example.com",
      )
      expect(yield* store.select.download.get).toContain("data:text/csv;charset=utf-8,name%2Cemail")

      const moments = yield* Ref.get(noted)
      const made = moments.find((seen) => seen.name === "sidebar/People/exported")

      expect(clicked).toHaveLength(32)
      expect(made?.traceId).toBe(clicked)
    }),
  )

  it.effect("with nobody selected the export says so, and nothing is produced", () =>
    Effect.gen(function* () {
      const { built, store } = yield* opened

      yield* Effect.provide(exportCsv(), built)

      expect(yield* store.select.problem.get).toBe("Select at least one person first")
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
