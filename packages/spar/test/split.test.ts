import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, pipe } from "effect"
import { Renderer, Server, View } from "spar"
import { find, mount } from "spar/testing"
import { LoadingView } from "./views.tsx"

const later = () => import("./later.tsx").then((module) => module.LaterView)

describe("a component whose code is loaded when it is first shown", () => {
  it.live("shows its placeholder until the code has arrived, then the component", () =>
    Effect.gen(function* () {
      const gate = Promise.withResolvers<undefined>()
      const Page = pipe(
        View.split(LoadingView, () => gate.promise.then(later)),
        View.mapProps(() => ({ id: "report" })),
      )

      yield* mount(Page)
      expect((yield* find("status")).textContent).toBe("Loading report")

      yield* Effect.sync(() => gate.resolve(undefined))
      expect((yield* find("heading", "Loaded later: report")).textContent).toBe(
        "Loaded later: report",
      )
      expect(screen.queryByRole("status")).toBeNull()
    }),
  )

  it.live("is rendered on the server with its code, not its placeholder", () =>
    Effect.gen(function* () {
      const Page = pipe(
        View.split(LoadingView, later),
        View.mapProps(() => ({ id: "report" })),
      )
      const made = yield* Server.render(Page, { layer: Renderer.html })

      expect(made.html).toContain("<h1>Loaded later: ")
      expect(made.html).not.toContain("Loading report")
    }),
  )
})
