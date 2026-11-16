import { PluginKind, declareValuePlugin } from "@stryker-mutator/api/plugin"

type Node = {
  readonly type: string
  readonly value?: unknown
  readonly name?: string
  readonly key?: Node
  readonly object?: Node
  readonly property?: Node
  readonly callee?: Node
  readonly properties?: ReadonlyArray<Node>
}

type Path = { readonly node: Node }

const neutralOptions: ReadonlySet<string> = new Set([
  "discard",
  "startImmediately",
  "captureStackTrace",
])

const namingCalls: ReadonlySet<string> = new Set([
  "Effect.fn",
  "Effect.withSpan",
  "Symbol.for",
  "Context.Reference",
])

const identities = /^~?spar\//

const calleeName = (node: Node): string =>
  `${node.callee?.object?.name ?? ""}.${node.callee?.property?.name ?? ""}`

const isNeutralOptions = (node: Node): boolean => {
  if (node.type !== "ObjectExpression") return false
  if (node.properties === undefined || node.properties.length === 0) return false

  return node.properties.every((property) => neutralOptions.has(property.key?.name ?? ""))
}

const isIdentity = (node: Node): boolean =>
  node.type === "StringLiteral" && typeof node.value === "string" && identities.test(node.value)

const isNamingCall = (node: Node): boolean =>
  node.type === "CallExpression" && namingCalls.has(calleeName(node))

const reasonFor = (node: Node): string | undefined => {
  if (isNeutralOptions(node)) return "an option that changes how work is run, not what it does"
  if (isIdentity(node)) return "an internal identity string no behaviour depends on"
  if (isNamingCall(node)) return "a span, symbol or reference name"

  return undefined
}

export const strykerPlugins = [
  declareValuePlugin(PluginKind.Ignore, "spar-names-and-run-options", {
    shouldIgnore: (path: Path) => reasonFor(path.node),
  }),
]
