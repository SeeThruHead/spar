import { Array, Schema } from "effect"
import { parseSync } from "oxc-parser"
import * as Diagnostics from "../Diagnostics.ts"

export type Rule =
  | "state-only-through-spar"
  | "backend-only-through-spar"
  | "no-waiting-in-components"

export type Violation = {
  readonly rule: Rule
  readonly code: Diagnostics.Code
  readonly message: string
  readonly file: string
  readonly line: number
  readonly column: number
}

const codes = {
  "state-only-through-spar": "SPAR_STATE_OUTSIDE_STORE",
  "no-waiting-in-components": "SPAR_WAIT_IN_COMPONENT",
  "backend-only-through-spar": "SPAR_BACKEND_AROUND_SPAR",
} as const satisfies Record<Rule, Diagnostics.Code>

const isComponent = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.Literal("compose") }),
  }),
)

const isWait = Schema.is(
  Schema.Struct({
    type: Schema.Literal("YieldExpression"),
    argument: Schema.Struct({
      type: Schema.Literal("CallExpression"),
      callee: Schema.Struct({
        object: Schema.Struct({ name: Schema.Literals(["Effect", "Deferred", "Fiber"]) }),
        property: Schema.Struct({
          name: Schema.Literals(["sleep", "promise", "tryPromise", "callback", "await", "join"]),
        }),
      }),
    }),
  }),
)

const functions: ReadonlySet<string> = new Set(["ArrowFunctionExpression", "FunctionExpression"])

type Where = "outside" | "entering" | "body" | "nested"

const inside = (node: unknown, type: string, where: Where): Where => {
  if (isComponent(node)) return "entering"
  if (!functions.has(type)) return where
  if (where === "entering") return "body"

  return where === "body" ? "nested" : where
}

const isNode = Schema.is(Schema.Struct({ type: Schema.String, start: Schema.Finite }))

const cells = Schema.Literals(["Ref", "SubscriptionRef", "SynchronizedRef", "MutableRef", "TxRef"])

const isCellMade = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      object: Schema.Struct({ name: cells }),
      property: Schema.Struct({ name: Schema.String.check(Schema.isStartingWith("make")) }),
    }),
  }),
)

const isReassignable = Schema.is(
  Schema.Struct({
    type: Schema.Literal("VariableDeclaration"),
    kind: Schema.Literals(["let", "var"]),
  }),
)

const isFetchCall = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.Literal("fetch") }),
  }),
)

const isMemberCall = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      property: Schema.Struct({ name: Schema.Literals(["fetch", "sendBeacon"]) }),
    }),
  }),
)

const isSocket = Schema.is(
  Schema.Struct({
    type: Schema.Literal("NewExpression"),
    callee: Schema.Struct({
      name: Schema.Literals(["XMLHttpRequest", "WebSocket", "EventSource"]),
    }),
  }),
)

const isFetchLayer = Schema.is(
  Schema.Struct({
    type: Schema.Literal("MemberExpression"),
    object: Schema.Struct({ name: Schema.Literal("FetchHttpClient") }),
    property: Schema.Struct({ name: Schema.Literal("layer") }),
  }),
)

const isSocketDial = Schema.is(
  Schema.Struct({
    type: Schema.Literal("MemberExpression"),
    object: Schema.Struct({ name: Schema.Literal("Socket") }),
    property: Schema.Struct({
      name: Schema.Literals([
        "makeWebSocket",
        "makeWebSocketChannel",
        "layerWebSocket",
        "layerWebSocketConstructorGlobal",
      ]),
    }),
  }),
)

const clients: ReadonlySet<string> = new Set([
  "axios",
  "ky",
  "got",
  "superagent",
  "graphql-request",
  "openapi-fetch",
  "@trpc/client",
  "@apollo/client",
  "socket.io-client",
])

const isImport = Schema.is(
  Schema.Struct({
    type: Schema.Literal("ImportDeclaration"),
    source: Schema.Struct({ value: Schema.String }),
  }),
)

const aroundTheBackend = (node: unknown): boolean => {
  if (isFetchCall(node) || isMemberCall(node)) return true
  if (isSocket(node) || isFetchLayer(node)) return true
  if (isSocketDial(node)) return true

  return isImport(node) && clients.has(node.source.value)
}

const ruleFor = (node: unknown, where: Where): ReadonlyArray<Rule> => {
  if (where === "body" && isWait(node)) return ["no-waiting-in-components"]
  if (isCellMade(node) || isReassignable(node)) return ["state-only-through-spar"]
  if (aroundTheBackend(node)) return ["backend-only-through-spar"]

  return []
}

const visit = (node: unknown, where: Where): ReadonlyArray<readonly [Rule, number]> => {
  if (!isNode(node)) return []

  const found = ruleFor(node, where).map((rule) => [rule, node.start] as const)
  if (found.length > 0) return found

  const within = inside(node, node.type, where)

  return Object.values(node).flatMap((value) =>
    Array.ensure(value).flatMap((child) => visit(child, within)),
  )
}

const locate = (
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } => {
  const before = source.slice(0, offset)

  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") }
}

export const check = (file: string, source: string): ReadonlyArray<Violation> =>
  visit(parseSync(file, source).program, "outside").map(([rule, offset]) => ({
    rule,
    code: codes[rule],
    message: `${Diagnostics.all[codes[rule]].what} ${Diagnostics.all[codes[rule]].fix}`,
    file,
    ...locate(source, offset),
  }))

const outside =
  /\/(node_modules|packages\/(spar|ui|browsers|lint|devtools-mcp)|server|test|scripts)\//

export const isAppFile = (path: string): boolean => {
  if (!/\.tsx?(\?|$)/.test(path)) return false
  if (/\.(test|config)\.tsx?(\?|$)/.test(path)) return false

  return !outside.test(path)
}
