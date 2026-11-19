import { Console, Effect, Layer, Option, Schema } from "effect"
import { McpClient, McpProtocol } from "effect/ai"
import { Argument, Command, Flag } from "effect/cli"
import { FetchHttpClient } from "effect/http"

export class NoSuchTool extends Schema.TaggedError<NoSuchTool, { readonly brand: unique symbol }>()(
  "NoSuchTool",
  { tool: Schema.String },
) {
  override get message() {
    return `There is no tool called ${this.tool}. Run "tools" to list the ones there are.`
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
    const client = yield* connected(given.url)
    const all = yield* client.listTools()
    const tool = yield* Effect.mapError(
      Effect.fromNullishOr(all.find((each) => each.name === given.tool)),
      () => new NoSuchTool({ tool: given.tool }),
    )
    const parameters = yield* Schema.decodeEffect(Given)(given.input)
    const result = yield* client.callTool({ tool, arguments: parameters })
    const said = result.content.filter(hasText).map((part) => part.text)

    if (result.isError === true) return yield* new ToolRefused({ reason: said.join("\n") })

    yield* Console.log(said.join("\n"))
  }, Effect.scoped),
).pipe(Command.withDescription("Ask the open app one thing and print the answer as JSON"))

export const command = Command.make("spar-devtools").pipe(
  Command.withDescription("The Spar devtools from a shell: the same tools the MCP server gives"),
  Command.withSubcommands([tools, call]),
)
