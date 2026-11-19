import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { HttpClient } from "effect/http"
import { Backend } from "spar"
import { check, isAppFile } from "spar/transform/app"
import { sparJsx } from "spar/transform/vite"

const rules = (source: string): ReadonlyArray<string> =>
  check("src/Board.ts", source).map((violation) => violation.rule)

describe("the build check on app code", () => {
  it("refuses state held outside a Store or UiState", () => {
    expect(rules(`const count = yield* Ref.make(0)`)).toEqual(["state-only-through-spar"])
    expect(rules(`const shown = yield* SubscriptionRef.make([])`)).toEqual([
      "state-only-through-spar",
    ])
    expect(rules(`const count = Ref.makeUnsafe(0)`)).toEqual(["state-only-through-spar"])
    expect(rules(`let total = 0`)).toEqual(["state-only-through-spar"])
    expect(rules(`var total = 0`)).toEqual(["state-only-through-spar"])
  })

  it("lets a store, UI state and constants through", () => {
    expect(
      rules(
        [
          `const open = yield* UiState.make("open", Schema.Boolean, false)`,
          `const store = yield* BoardStore`,
          `const total = Ref.get(somewhere)`,
          `const made = Thing.make(1)`,
        ].join("\n"),
      ),
    ).toEqual([])
  })

  it("refuses every way around the backend client", () => {
    expect(rules(`const answer = await fetch("/api/agents")`)).toEqual([
      "backend-only-through-spar",
    ])
    expect(rules(`globalThis.fetch("/api/agents")`)).toEqual(["backend-only-through-spar"])
    expect(rules(`navigator.sendBeacon("/seen", "1")`)).toEqual(["backend-only-through-spar"])
    expect(rules(`const socket = new WebSocket("wss://backend")`)).toEqual([
      "backend-only-through-spar",
    ])
    expect(rules(`const request = new XMLHttpRequest()`)).toEqual(["backend-only-through-spar"])
    expect(rules(`const events = new EventSource("/events")`)).toEqual([
      "backend-only-through-spar",
    ])
    expect(rules(`const client = Layer.provide(api, FetchHttpClient.layer)`)).toEqual([
      "backend-only-through-spar",
    ])
    expect(rules(`import axios from "axios"`)).toEqual(["backend-only-through-spar"])
    expect(rules(`import { createTRPCClient } from "@trpc/client"`)).toEqual([
      "backend-only-through-spar",
    ])
  })

  it("lets the blessed client through", () => {
    expect(
      rules(
        [
          `import { Backend } from "spar"`,
          `import { HttpClient } from "effect/http"`,
          `const agents = yield* Backend.rpc(Agents, "/rpc")`,
          `const layer = Layer.provide(api, Backend.layer)`,
          `const fresh = new Map()`,
          `const fetched = store.fetched(1)`,
        ].join("\n"),
      ),
    ).toEqual([])
  })

  it("says where the problem is and what to do instead", () => {
    expect(check("src/Board.ts", `const a = 1\nconst count = Ref.make(0)`)).toMatchObject([
      { file: "src/Board.ts", line: 2, column: 15, rule: "state-only-through-spar" },
    ])
    expect(check("src/Board.ts", `fetch("/x")`)[0]?.message).toContain("Backend.rpc")
  })

  it("looks at app source only", () => {
    expect(isAppFile("/app/src/Board.ts")).toBe(true)
    expect(isAppFile("/app/src/BoardView.tsx?v=2")).toBe(true)
    expect(isAppFile("/app/src/app.css")).toBe(false)
    expect(isAppFile("/app/src/Board.test.ts")).toBe(false)
    expect(isAppFile("/app/vite.config.ts")).toBe(false)
    expect(isAppFile("/app/node_modules/effect/src/Ref.ts")).toBe(false)
    expect(isAppFile("/repo/packages/spar/src/Store.ts")).toBe(false)
    expect(isAppFile("/app/src/server/InMemory.ts")).toBe(false)
    expect(isAppFile("/app/test/helpers.ts")).toBe(false)
  })

  it("the Vite plugin stops the build on app code that breaks a rule, and only there", () => {
    expect(() => sparJsx.transform(`let total = 0`, "/app/src/Board.ts")).toThrow(
      "state-only-through-spar",
    )
    expect(sparJsx.transform(`let total = 0`, "/app/src/server/Fake.ts")).toBeNull()
    expect(sparJsx.transform(`const total = 0`, "/app/src/Board.ts")).toBeNull()
  })
})

describe("what Backend gives besides the logged client", () => {
  it.effect("a client for telemetry, which is not put in the log", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      expect(typeof client.get).toBe("function")
    }).pipe(Effect.provide(Backend.layerTelemetry)),
  )

  it.effect("a beacon, for what must still be sent as the page goes away", () =>
    Effect.gen(function* () {
      const sent = yield* Backend.beacon("data:text/plain,", "gone")

      expect(typeof sent).toBe("boolean")
    }),
  )
})
