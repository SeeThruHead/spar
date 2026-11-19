import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
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

const Desk = View.described(["Tally", "Router.Router"]).connect(
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

const under = (nodes: ReadonlyArray<Element>) =>
  Effect.sync(() => {
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [...nodes],
    })
  })

const gone = (id: string | null): Element => {
  const node = document.createElement("div")

  node.setAttribute("data-spar-view", id ?? "")

  return node
}

const facts = (table: string): ReadonlyArray<string> =>
  [...screen.getByLabelText(table, { exact: true }).querySelectorAll("tr")].map((row) =>
    [
      row.querySelector("th")?.textContent,
      row.querySelector("code")?.textContent,
      row.querySelector("small")?.textContent,
    ]
      .filter((part) => part !== "")
      .join(" "),
  )

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

  it.live("a component picked on the page shows its data, and what each action changed", () =>
    withTools(
      Effect.gen(function* () {
        yield* mounted
        yield* Testing.click("button", "Devtools")
        expect(screen.getByLabelText("Picked component").textContent).toBe("Nothing picked yet")

        const draft = yield* Testing.find("textbox", "Draft")
        const tools = yield* Testing.find("button", "Devtools")

        yield* under([tools, document.body, draft])
        yield* Testing.click("button", "Pick a component")

        const veil = yield* Testing.find("button", "Pick a component on the page")
        const veilId = veil.getAttribute("data-spar-view")

        yield* Effect.sync(() => fireEvent.pointerMove(veil, { clientX: 10, clientY: 10 }))
        yield* Testing.eventually(() =>
          expect(screen.getByLabelText("Highlighted component").textContent).toBe("DeskView"),
        )
        yield* Effect.sync(() => fireEvent.click(veil, { clientX: 10, clientY: 10 }))
        yield* Testing.gone("button", "Pick a component on the page")
        yield* Testing.eventually(() => expect(facts("Props")).toContain('draft ""'))
        expect(screen.getByLabelText("Picked component").textContent).toBe("DeskView")
        expect(screen.getByLabelText("Where it is").textContent).toBe("DeskView")
        expect(screen.getByLabelText("Services").textContent).toBe("Tally, Router.Router")
        expect(facts("Props")).toEqual([
          "count 0 test/Tally . count",
          'draft ""',
          'onAdd "action"',
          'onGo "action"',
        ])
        expect(facts("UI state")).toEqual(['draft ""'])

        yield* Testing.fill("textbox", "Draft", "hi")
        yield* Testing.click("button", "Add")
        yield* Testing.eventually(() =>
          expect(facts("Props").slice(0, 2)).toEqual(["count 1 test/Tally . count", 'draft "hi"']),
        )
        yield* Testing.eventually(() =>
          expect(
            [...screen.getByLabelText("What changed").querySelectorAll("li")].map(
              (item) => item.textContent,
            ),
          ).toEqual([
            'prop draft "" became "hi" after 1: ui DeskView . draft',
            'state draft "" became "hi" after 1: ui DeskView . draft',
            "prop count 0 became 1 after 2: command test/Tally/added",
          ]),
        )

        yield* under([yield* Testing.findText("Type a note")])
        yield* Testing.click("button", "Pick a component")
        yield* Effect.flatMap(Testing.find("button", "Pick a component on the page"), (over) =>
          Effect.sync(() => fireEvent.click(over, { clientX: 2, clientY: 2 })),
        )
        yield* Testing.eventually(() =>
          expect(screen.getByLabelText("Picked component").textContent).toBe("HintView"),
        )
        expect(screen.getByLabelText("Where it is").textContent).toBe("A view drawn by its parent")
        expect(screen.getByLabelText("Services").textContent).toBe(
          "None: a view cannot reach a service",
        )
        expect(facts("Props")).toEqual(['text "Type a note"'])
        expect(facts("UI state")).toEqual([])

        yield* under([gone(veilId)])
        yield* Testing.click("button", "Pick a component")
        yield* Effect.flatMap(Testing.find("button", "Pick a component on the page"), (over) =>
          Effect.sync(() => fireEvent.pointerMove(over, { clientX: 3, clientY: 3 })),
        )
        yield* Testing.eventually(() =>
          expect(screen.queryByLabelText("Highlighted component")).toBeNull(),
        )
        yield* Testing.press("Escape")
        yield* Testing.gone("button", "Pick a component on the page")

        yield* under([])
        yield* Testing.click("button", "Pick a component")
        yield* Testing.press("Escape")
        yield* Testing.gone("button", "Pick a component on the page")
        yield* Testing.press("a")
        yield* Testing.click("button", "Pick a component")
        yield* Effect.flatMap(Testing.find("button", "Pick a component on the page"), (over) =>
          Effect.sync(() => fireEvent.click(over, { clientX: 1, clientY: 1 })),
        )
        yield* Testing.eventually(() =>
          expect(screen.getByLabelText("Picked component").textContent).toBe("Nothing picked yet"),
        )
        expect(facts("Props")).toEqual([])
        expect(screen.getByLabelText("What changed").querySelectorAll("li")).toHaveLength(0)
        expect(screen.queryByLabelText("Highlighted component")).toBeNull()
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
