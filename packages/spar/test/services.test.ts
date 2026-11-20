import { describe, expect, it } from "vitest"
import { sparDevtools } from "spar/devtools/vite"
import { describeServices } from "../src/transform/services.ts"

const composed = `import { compose, withStore, withQuery } from "spar"

const withAgent = Effect.fnUntraced(function* (props) {
  const outbox = yield* Outbox.Outbox
  const router = yield* Router.Router
  const again = yield* Outbox.Outbox
  const lower = yield* helper
  const made = yield* effect.Thing
  const called = yield* helper()

  return { outbox, router, again, lower, made, called }
})

export const Sidebar = compose(
  withStore(BoardStore, (store) => ({ board: store.select.board })),
  withQuery("record", RecordQuery, (props) => props.name),
  withAgent,
  withStore(store, (found) => found),
)((props) => <nav />)

export const Plain = compose(() => Effect.succeed({}))(PlainView)
`

describe("naming the services a composed component uses, for the inspector", () => {
  it("puts them first in its enhancers, from withStore, withQuery and what its own enhancers yield", () => {
    const described = describeServices("Sidebar.tsx", composed)

    expect(described).toContain(
      `compose(\n  __sparUses(["BoardStore","RecordQuery","Outbox.Outbox","Router.Router"]), withStore(BoardStore`,
    )
    expect(described).toContain(`compose(__sparUses([]), () => Effect.succeed({}))(PlainView)`)
    expect(described.startsWith(`import { uses as __sparUses } from "spar"; import`)).toBe(true)
    expect(described.split("\n")).toHaveLength(composed.split("\n").length)
    expect(describeServices("plain.ts", "export const a = 1")).toBe("export const a = 1")
  })

  it("the dev plugin only rewrites the app's own files that make components", () => {
    expect(sparDevtools().enforce).toBe("pre")
    expect(sparDevtools().transform(composed, "/app/src/Sidebar.tsx")?.code).toContain(
      `__sparUses(["BoardStore"`,
    )
    expect(sparDevtools().transform(composed, "/app/src/Sidebar.tsx")?.map).toBeNull()
    expect(sparDevtools().transform(composed, "/app/src/Sidebar.tsx?v=2")?.code).toContain(
      "__sparUses",
    )
    expect(sparDevtools().transform(composed, "/app/node_modules/pkg/Sidebar.tsx")).toBeNull()
    expect(sparDevtools().transform(composed, "/app/src/styles.css")).toBeNull()
    expect(sparDevtools().transform("export const a = 1", "/app/src/a.ts")).toBeNull()
    expect(sparDevtools().transform("compose(withProps({}))(V)", "/app/src/b.ts")?.code).toBe(
      `import { uses as __sparUses } from "spar"; compose(__sparUses([]), withProps({}))(V)`,
    )
  })
})
