import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Effect, Layer, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { App, Router, Store, UiState, View } from "spar"
import { install, uninstall } from "spar/devtools/client"
import { sparDevtools } from "spar/devtools/vite"
import * as Testing from "spar/testing"
import { DeskView } from "./timeline.tsx"

const State = Schema.Struct({ count: Schema.Finite })

type State = typeof State.Type

class Tally extends Store.Tag<Tally>()("test/Tally", {
  state: State,
  initialState: { count: 0 },
  actions: {
    added: Store.action(Schema.Struct({ by: Schema.Finite }), (state: State, { by }) => ({
      count: state.count + by,
    })),
  },
  selectors: { count: Store.selector(Schema.Finite, (state: State) => state.count) },
}) {}

const next = Router.route("/next")

const Desk = View.connect(
  Effect.fnUntraced(function* () {
    const tally = yield* Tally
    const router = yield* Router.Router

    return {
      count: tally.select.count,
      draft: yield* UiState.make("draft", Schema.String, ""),
      onAdd: tally.commands.added({ by: 1 }),
      onGo: router.go(next, {}),
    }
  }),
)(DeskView)

const layer = Layer.mergeAll(Tally.layer(), Router.Router.layerMemory("/")).pipe(
  Layer.provide(SecureRandom.layerWebCrypto),
  Layer.provideMerge(Layer.sync(UiState.Tree, UiState.makeTree)),
)

const mounted = Effect.gen(function* () {
  const target = yield* Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (node) => Effect.sync(() => node.remove()),
  )

  yield* Effect.forkScoped(App.mount(Desk, { target, layer }), { startImmediately: true })
})

const withTools = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(install),
    () => effect,
    () => Effect.sync(uninstall),
  )

const shown = (): ReadonlyArray<string | null> => {
  const draft = screen.getByLabelText("Draft")

  return [
    screen.getByLabelText("Count").textContent,
    draft instanceof HTMLInputElement ? draft.value : null,
    screen.getByLabelText("Timeline position").textContent,
  ]
}

const shows = (count: string, draft: string, position: string) =>
  Testing.eventually(() => expect(shown()).toEqual([count, draft, position]))

const listed = (): ReadonlyArray<string | null | undefined> =>
  [...screen.getByLabelText("Everything that happened").querySelectorAll("li")].map(
    (item) => item.querySelector("code")?.textContent,
  )

describe("devtools an app did not ask for", () => {
  it.live("once installed, an app that never mentions them gets the tools and the one log", () =>
    withTools(
      Effect.gen(function* () {
        yield* mounted
        yield* Testing.click("button", "Devtools")
        yield* Testing.fill("textbox", "Draft", "hi")
        yield* Testing.click("button", "Add")
        yield* Testing.fill("textbox", "Draft", "later")
        yield* shows("1", "later", "Now")
        expect(listed()).toEqual([
          'ui DeskView . draft "hi"',
          'command test/Tally/added {"by":1}',
          'ui DeskView . draft "later"',
        ])
        expect(screen.getByLabelText("Trace of 2").textContent).toHaveLength(32)

        yield* Testing.click("button", "Jump to 1")
        yield* shows("0", "hi", "At 1")
        expect(
          [...screen.getByLabelText("Everything that happened").querySelectorAll("li")].map(
            (item) => item.getAttribute("aria-current"),
          ),
        ).toEqual(["true", "false", "false"])
        yield* Testing.click("button", "Later")
        yield* shows("1", "hi", "At 2")
        yield* Testing.click("button", "Earlier")
        yield* Testing.click("button", "Earlier")
        yield* shows("0", "hi", "At 1")
        yield* Testing.click("button", "Back to now")
        yield* shows("1", "later", "Now")
        yield* Testing.click("button", "Earlier")
        yield* shows("1", "later", "At 3")
        yield* Testing.click("button", "Later")
        yield* shows("1", "later", "Now")
        expect(screen.getByLabelText("test/Tally position").textContent).toBe("live")
      }),
    ),
  )

  it.live("without the install an app has no tools at all", () =>
    Effect.gen(function* () {
      yield* mounted
      yield* Testing.find("button", "Add")
      expect(screen.queryByRole("button", { name: "Devtools" })).toBeNull()
      expect(document.querySelector("[data-spar-devtools]")).toBeNull()
    }),
  )

  it.live("the entry the plugin adds installs the tools as it loads", () =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.promise(() => import("spar/devtools/entry")),
        () => Effect.sync(uninstall),
      )
      yield* mounted
      yield* Testing.find("button", "Devtools")
    }),
  )

  it("the Vite plugin only acts on the dev server, and adds the tools before the app", () => {
    expect(sparDevtools.apply).toBe("serve")
    expect(sparDevtools.transformIndexHtml()).toEqual([
      {
        tag: "script",
        attrs: { type: "module", src: "/@id/spar/devtools/entry" },
        injectTo: "head-prepend",
      },
    ])
  })
})
