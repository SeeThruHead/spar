import { describe, expect, it } from "vitest"
import { sparDevtools } from "spar/devtools/vite"
import { describeServices } from "../src/transform/services.ts"

const source = `import { Effect } from "effect"
import { Router, View } from "spar"

const threadProps = Effect.fnUntraced(function* ({ id }) {
  const api = yield* MailApi
  const draft = yield* UiState.make("draft", Schema.String, "")

  return { id, api, draft }
})

export const Thread = flow(View.taking({ id: Schema.String }, threadProps), View.pending(Skeleton))(ThreadView)

export const Counter = View.connect(
  Effect.fnUntraced(function* () {
    const store = yield* CounterStore
    const router = yield* Router.Router
    const again = yield* CounterStore
    const lower = yield* helper
    const made = yield* effect.Thing

    return { count: store.select.count, router, again, lower, made }
  }),
)(CounterView)

export const Plain = View.connect(() => Effect.succeed({}))(PlainView)
`

const composed = `import { compose, withStore, withQuery } from "spar"

const withAgent = Effect.fnUntraced(function* (props) {
  const outbox = yield* Outbox.Outbox

  return { outbox }
})

export const Sidebar = compose(
  withStore(BoardStore, (store) => ({ board: store.select.board })),
  withQuery("record", RecordQuery, (props) => props.name),
  withAgent,
  withStore(store, (found) => found),
)((props) => <nav />)
`

describe("naming the services a composed component uses, for the inspector", () => {
  it("puts them first in its enhancers, from withStore, withQuery and what its own enhancers yield", () => {
    const described = describeServices("Sidebar.tsx", composed)

    expect(described).toContain(
      `compose(\n  __sparUses(["BoardStore","RecordQuery","Outbox.Outbox"]), withStore(BoardStore`,
    )
    expect(described.startsWith(`import { uses as __sparUses } from "spar"; import`)).toBe(true)
    expect(described.split("\n")).toHaveLength(composed.split("\n").length)
  })
})

describe("naming the services a component uses, for the inspector", () => {
  it("rewrites each component to say which service tags its Effect yields", () => {
    const described = describeServices("Thread.ts", source)

    expect(described).toContain(
      `View.described(["MailApi"]).taking({ id: Schema.String }, threadProps)`,
    )
    expect(described).toContain(
      `View.described(["CounterStore","Router.Router"]).connect(\n  Effect.fnUntraced`,
    )
    expect(described).toContain(`View.described([]).connect(() => Effect.succeed({}))`)
    expect(described).not.toContain("View.connect(")
    expect(described.split("\n")).toHaveLength(source.split("\n").length)
  })

  it("the dev plugin only rewrites the app's own files that make components", () => {
    expect(sparDevtools().enforce).toBe("pre")
    expect(sparDevtools().transform(source, "/app/src/Thread.ts")?.code).toContain(
      `View.described(["MailApi"])`,
    )
    expect(sparDevtools().transform(source, "/app/src/Thread.ts")?.map).toBeNull()
    expect(sparDevtools().transform(source, "/app/src/Thread.tsx?v=2")?.code).toContain(
      "View.described",
    )
    expect(sparDevtools().transform(source, "/app/node_modules/pkg/Thread.ts")).toBeNull()
    expect(sparDevtools().transform(source, "/app/src/styles.css")).toBeNull()
    expect(sparDevtools().transform("export const a = 1", "/app/src/a.ts")).toBeNull()
    expect(sparDevtools().transform("View.taking({}, props)(V)", "/app/src/b.ts")?.code).toBe(
      "View.described([]).taking({}, props)(V)",
    )
  })
})
