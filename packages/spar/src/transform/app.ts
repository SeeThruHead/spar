import { Array, Schema } from "effect"
import { parseSync } from "oxc-parser"

export type Rule = "state-only-through-spar" | "backend-only-through-spar"

export type Violation = {
  readonly rule: Rule
  readonly message: string
  readonly file: string
  readonly line: number
  readonly column: number
}

const messages: Readonly<Record<Rule, string>> = {
  "state-only-through-spar":
    "State is held in a Store (Store.Tag, placed with .layer or beside a view with .with) or in UiState.make, so every change is an action in the one log the devtools read. A Ref, a SubscriptionRef or a variable that is assigned again is state the log cannot see.",
  "backend-only-through-spar":
    "A backend is called through Backend (Backend.rpc for an Effect RPC group, or the HttpClient that Backend.layer provides for HttpApi and JSON clients), so every call is a span and an entry in the log. fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon, FetchHttpClient.layer and other client libraries go around it.",
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

  return isImport(node) && clients.has(node.source.value)
}

const ruleFor = (node: unknown): ReadonlyArray<Rule> => {
  if (isCellMade(node) || isReassignable(node)) return ["state-only-through-spar"]
  if (aroundTheBackend(node)) return ["backend-only-through-spar"]

  return []
}

const visit = (node: unknown): ReadonlyArray<readonly [Rule, number]> => {
  if (!isNode(node)) return []

  const found = ruleFor(node).map((rule) => [rule, node.start] as const)
  if (found.length > 0) return found

  return Object.values(node).flatMap((value) => Array.ensure(value).flatMap(visit))
}

const locate = (
  source: string,
  offset: number,
): { readonly line: number; readonly column: number } => {
  const before = source.slice(0, offset)

  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") }
}

export const check = (file: string, source: string): ReadonlyArray<Violation> =>
  visit(parseSync(file, source).program).map(([rule, offset]) => ({
    rule,
    message: messages[rule],
    file,
    ...locate(source, offset),
  }))

const outside = /\/(node_modules|packages\/(spar|ui|browsers|lint)|server|test|scripts)\//

export const isAppFile = (path: string): boolean => {
  if (!/\.tsx?(\?|$)/.test(path)) return false
  if (/\.(test|config)\.tsx?(\?|$)/.test(path)) return false

  return !outside.test(path)
}
