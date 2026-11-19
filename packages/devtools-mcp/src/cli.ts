import { Console, Effect, Layer, Option, Schema } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { Argument, Command, Flag } from "effect/cli"
import { FetchHttpClient } from "effect/http"
import { Diagnostics } from "spar"
import * as Spans from "spar/devtools/spans"
import { Navigation } from "./server.ts"

export class NoSuchTool extends Schema.TaggedError<NoSuchTool, { readonly brand: unique symbol }>()(
  "NoSuchTool",
  { tool: Schema.String },
) {
  override get message() {
    return Diagnostics.text("SPAR_TOOL_NO_TOOL", { said: `There is no tool called ${this.tool}.` })
  }
}

export class ToolRefused extends Schema.TaggedError<
  ToolRefused,
  { readonly brand: unique symbol }
>()("ToolRefused", { reason: Schema.String }) {
  override get message() {
    return this.reason
  }
}

const url = Flag.String("url").pipe(
  Flag.withDescription("Where the devtools server listens"),
  Flag.withDefault("http://127.0.0.1:4188"),
)

const connected = Effect.fnUntraced(function* (address: string) {
  const built = yield* Layer.build(
    McpClient.layerHttp({
      name: "spar devtools cli",
      version: "0.0.0",
      url: `${address}/mcp`,
      protocol: McpProtocol.v2025_11_25,
    }).pipe(Layer.provide(FetchHttpClient.layer)),
  )

  return yield* Effect.provide(McpClient.McpClient, built)
})

const hasText = Schema.is(Schema.Struct({ text: Schema.String }))

const Given = Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))

const tools = Command.make(
  "tools",
  { url },
  Effect.fnUntraced(function* (given) {
    const client = yield* connected(given.url)
    const all = yield* client.listTools()

    yield* Console.log(
      all
        .map((tool) =>
          [tool.name, ...Option.toArray(Option.fromNullishOr(tool.description))].join("\n  "),
        )
        .join("\n\n"),
    )
  }, Effect.scoped),
).pipe(Command.withDescription("List what an agent can ask the open app"))

const asked = Effect.fnUntraced(function* (
  address: string,
  name: string,
  parameters: Readonly<Record<string, Schema.Json>>,
) {
  const client = yield* connected(address)
  const all = yield* client.listTools()
  const tool = yield* Effect.mapError(
    Effect.fromNullishOr(all.find((each) => each.name === name)),
    () => new NoSuchTool({ tool: name }),
  )
  const result = yield* client.callTool({ tool, arguments: parameters })
  const said = result.content.filter(hasText).map((part) => part.text)

  if (result.isError === true) return yield* new ToolRefused({ reason: said.join("\n") })

  return said.join("\n")
})

const call = Command.make(
  "call",
  {
    url,
    tool: Argument.String("tool").pipe(Argument.withDescription("A tool's name, as tools lists")),
    input: Argument.String("input").pipe(
      Argument.withDescription("The tool's parameters as JSON"),
      Argument.withDefault("{}"),
    ),
  },
  Effect.fnUntraced(function* (given) {
    const parameters = yield* Schema.decodeEffect(Given)(given.input)
    const said = yield* asked(given.url, given.tool, parameters)

    yield* Console.log(said)
  }, Effect.scoped),
).pipe(Command.withDescription("Ask the open app one thing and print the answer as JSON"))

const depthOf = (
  span: Spans.Recorded,
  byId: ReadonlyMap<string, Spans.Recorded>,
  seen: number,
): number =>
  Option.match(Option.fromUndefinedOr(byId.get(span.parentSpanId ?? "")), {
    onNone: () => seen,
    onSome: (parent) => depthOf(parent, byId, seen + 1),
  })

const noteOf = (span: Spans.Recorded): string =>
  [
    ...(span.failed ? ["failed"] : []),
    ...Option.toArray(
      Option.map(
        Option.fromUndefinedOr(span.attributes["spar.query.after"]),
        (source) => `input from ${source}`,
      ),
    ),
    ...Option.toArray(
      Option.map(
        Option.fromUndefinedOr(span.attributes["spar.query.served_from"]),
        (trace) => `served from what trace ${trace.slice(0, 8)} loaded`,
      ),
    ),
    ...Option.toArray(
      Option.map(Option.fromUndefinedOr(span.attributes["spar.view"]), (view) => `in ${view}`),
    ),
  ].join(", ")

export const waterfall = (spans: ReadonlyArray<Spans.Recorded>): string => {
  const ordered = spans.toSorted((left, right) => left.startedAt - right.startedAt)
  const byId = new Map(ordered.map((span) => [span.spanId, span]))
  const start = Math.min(...ordered.map((span) => span.startedAt))

  return ordered
    .map((span) =>
      [
        `${"  ".repeat(depthOf(span, byId, 0))}${span.name}`,
        `+${(span.startedAt - start).toFixed(1)} ms`,
        `${((span.endedAt ?? span.startedAt) - span.startedAt).toFixed(1)} ms`,
        noteOf(span),
      ]
        .filter((part) => part !== "")
        .join("  "),
    )
    .join("\n")
}

const Found = Schema.fromJsonString(Navigation)

const Listed = Schema.fromJsonString(Schema.Array(Spans.Recorded))

const ofTrace = Effect.fnUntraced(function* (address: string, traceId: string, lens: string) {
  const said = yield* asked(address, "get_trace", { traceId, lens })
  const spans = yield* Schema.decodeEffect(Listed)(said)

  return [
    `trace ${traceId}, ${spans.length} spans`,
    waterfall(spans),
    ...Spans.chainsOf(spans).map(Spans.chainText),
  ].join("\n")
})

const ofNavigation = Effect.fnUntraced(function* (address: string, back: number, lens: string) {
  const said = yield* asked(address, "get_navigation", { back, lens })
  const found = yield* Schema.decodeEffect(Found)(said)
  if (found.route === null) return "The app has not changed route yet."

  return [
    `${found.route}, trace ${found.traceId}, ${found.spans.length} spans`,
    waterfall(found.spans),
    ...found.chains,
  ].join("\n")
})

const trace = Command.make(
  "trace",
  {
    url,
    lens: Flag.String("lens").pipe(
      Flag.withDescription("Keep one kind of span: all, rendering, data, stores or backend"),
      Flag.withDefault("all"),
    ),
    back: Flag.Int("back").pipe(
      Flag.withDescription("Count route changes back from the newest; 1 is the one before"),
      Flag.withDefault(0),
    ),
    id: Flag.optional(
      Flag.String("id").pipe(Flag.withDescription("A trace id, instead of a route change")),
    ),
  },
  Effect.fnUntraced(function* (given) {
    const text = yield* Option.match(given.id, {
      onNone: () => ofNavigation(given.url, given.back, given.lens),
      onSome: (traceId) => ofTrace(given.url, traceId, given.lens),
    })

    yield* Console.log(text)
  }, Effect.scoped),
).pipe(
  Command.withDescription(
    "Print the newest route change as a waterfall: each span, when it started, how long it took and what it waited for",
  ),
)

export const command = Command.make("spar-devtools").pipe(
  Command.withDescription("The Spar devtools from a shell: the same tools the MCP server gives"),
  Command.withSubcommands([tools, call, trace]),
)
