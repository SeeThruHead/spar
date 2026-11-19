import { describe, expect, it } from "@effect/vitest"
import { Effect, Option, Ref } from "effect"
import { Timeline, UiState } from "spar"
import { noticed } from "../src/internal/notice.ts"
import { ViewScope } from "../src/internal/viewScope.ts"

describe("something Spar noticed", () => {
  it.effect("is an entry in the log that names the component it happened in", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const scope = yield* Effect.scope
      const page = { parent: undefined, label: "PageView", at: "", scope, tree: UiState.makeTree() }

      yield* noticed("SPAR_SENT_AGAIN", "shop/Till/paid", "Paid twice.").pipe(
        Effect.provideService(ViewScope, {
          parent: page,
          label: "PayView",
          at: "/src/PayView.tsx:4:1",
          scope,
          tree: page.tree,
        }),
        Effect.provideService(
          Timeline.Recorder,
          Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
        ),
      )
      expect((yield* Ref.get(noted)).map((seen) => [seen.kind, seen.name, seen.detail])).toEqual([
        [
          "noticed",
          "shop/Till/paid",
          {
            code: "SPAR_SENT_AGAIN",
            said: "Paid twice.",
            in: "PageView > PayView",
            at: "/src/PayView.tsx:4:1",
          },
        ],
      ])
    }),
  )
})
