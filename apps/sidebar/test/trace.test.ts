import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Context, Effect, Layer, Schedule, Schema } from "effect"
import { SecureRandom } from "effect/crypto"
import { FetchHttpClient } from "effect/http"
import { KeyValueStore } from "effect/persistence"
import { App, Outbox, Router } from "spar"
import * as Spans from "spar/devtools/spans"
import * as Testing from "spar/testing"
import { Toast } from "@spar/ui"
import { BoardStoreLive } from "../src/BoardStore.ts"
import { deepQueries } from "../src/Deep.ts"
import { Server } from "../src/server/Server.ts"
import { Shell } from "../src/Shell.tsx"

const addressOf = (input: URL | RequestInfo): string => {
  if (typeof input === "string") return input

  return input instanceof URL ? input.href : input.url
}

const outOfThePage: typeof globalThis.fetch = Object.assign(
  (input: URL | RequestInfo, init?: RequestInit) =>
    Bun.fetch(addressOf(input), {
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers ?? {}).entries()),
      body: init?.body ?? null,
    }),
  { preconnect: Bun.fetch.preconnect },
)

const freePort = Effect.sync(() => {
  const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(null) })
  const port = probe.port

  void probe.stop(true)

  return port
})

const spansOf = (origin: string, traceId: string) =>
  Effect.promise(() =>
    outOfThePage(`${origin}/spans/${traceId}`).then((answer) => answer.json()),
  ).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Spans.Recorded))),
    Effect.orElseSucceed((): ReadonlyArray<Spans.Recorded> => []),
  )

const backend = Effect.gen(function* () {
  const port = yield* freePort
  const origin = `http://127.0.0.1:${port}`

  yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.spawn(["bun", "scripts/backend.ts"], {
        env: { ...Bun.env, PORT: String(port) },
        stdout: "ignore",
        stderr: "inherit",
      }),
    ),
    (running) => Effect.sync(() => running.kill()),
  )
  yield* Effect.retry(
    Effect.tryPromise(() => outOfThePage(`${origin}/spans/none`)),
    Schedule.spaced("50 millis"),
  )

  return origin
})

const app = (origin: string) =>
  Layer.merge(BoardStoreLive, deepQueries).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.provide(Server.layerRemote(`${origin}/rpc`), FetchHttpClient.layer),
        Layer.succeed(FetchHttpClient.Fetch, outOfThePage),
        Outbox.Outbox.layer,
        Router.Router.layerMemory("/"),
        Toast.Toasts.layer,
      ),
    ),
    Layer.provide(SecureRandom.layerWebCrypto),
    Layer.provide(KeyValueStore.layerMemory),
  )

const opened = (agent: string) =>
  Effect.sync(() => fireEvent.click(screen.getByText(agent).closest("a") ?? document.body))

const named = (spans: ReadonlyArray<Spans.Recorded>, name: string) =>
  spans.filter((span) => span.name === name)

describe("one trace from a click to the server and back", () => {
  it.live("starting an agent is one connected trace across the browser and the backend", () =>
    Effect.gen(function* () {
      const origin = yield* backend
      const browser = yield* Layer.build(Spans.layer())
      const target = yield* Effect.acquireRelease(
        Effect.sync(() => document.body.appendChild(document.createElement("div"))),
        (node) => Effect.sync(() => node.remove()),
      )

      yield* Effect.forkScoped(App.mount(Shell, { target, layer: app(origin) }), {
        startImmediately: true,
      }).pipe(Effect.provide(browser))
      yield* Testing.click("button", "Start an agent")

      const dialog = yield* Testing.find("dialog")

      yield* Effect.sync(() => {
        fireEvent.input(screen.getByRole("textbox", { name: "What should it work on?" }), {
          target: { value: "Trace me" },
        })
        fireEvent.submit(dialog.querySelector("form") ?? dialog)
      })

      const inBrowser = Context.get(browser, Spans.SpanBuffer)
      const submit = yield* Effect.repeat(
        Effect.sync(() => named(inBrowser.recent(), "on submit")),
        { until: (found) => found.length > 0, schedule: Schedule.spaced("10 millis") },
      )
      const traceId = submit[0]?.traceId ?? ""
      const onServer = yield* Effect.repeat(spansOf(origin, traceId), {
        until: (spans) =>
          named(spans, "Agents.start").filter((span) => span.endedAt !== null).length >= 2,
        schedule: Schedule.spaced("50 millis"),
      })
      const mine = inBrowser.ofTrace(traceId)
      const browserIds = new Set(mine.map((span) => span.spanId))
      const serverIds = new Set(onServer.map((span) => span.spanId))
      const arriving = onServer.filter((span) => !serverIds.has(span.parentSpanId ?? ""))

      expect(named(mine, "sidebar/BoardStore/started")).toHaveLength(1)
      expect(named(mine, "Outbox.deliver")).toHaveLength(1)
      expect(named(onServer, "Agents.start").map((span) => span.attributes["agent.name"])).toEqual([
        "Trace me",
        "Trace me",
      ])
      expect(named(onServer, "Agents.start").map((span) => span.failed)).toEqual([true, false])
      expect(arriving.length).toBeGreaterThanOrEqual(2)
      expect(arriving.every((span) => browserIds.has(span.parentSpanId ?? ""))).toBe(true)
      expect(onServer.every((span) => span.traceId === traceId)).toBe(true)

      yield* opened("Inbox triage")
      yield* Testing.eventually(() =>
        expect(screen.getByLabelText("Server record").textContent).toBe(
          "The server has no record of Inbox triage yet.",
        ),
      )
      yield* opened("Trace me")
      yield* Testing.eventually(() =>
        expect(screen.getByLabelText("Server record").textContent).toMatch(
          /^The server started this agent as [0-9a-f-]{36}\.$/,
        ),
      )

      const page = named(inBrowser.recent(), "ServerRecordView").at(-1)
      const click = named(inBrowser.recent(), "on click").at(-1)
      const asked = yield* spansOf(origin, click?.traceId ?? "")

      expect(page?.traceId).toBe(click?.traceId)

      expect(named(asked, "Agents.describe").map((span) => span.failed)).toEqual([false])
    }),
  )
})
