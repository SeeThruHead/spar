import { Array, Option, Schema } from "effect"
import { parseSync } from "oxc-parser"

const Node = Schema.Struct({ type: Schema.String, start: Schema.Finite, end: Schema.Finite })

const isNode = Schema.is(Node)

const Named = Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.String })

const isNamed = Schema.is(Named)

const isMember = Schema.is(
  Schema.Struct({ type: Schema.Literal("MemberExpression"), object: Named, property: Named }),
)

const isYielded = Schema.is(
  Schema.Struct({
    type: Schema.Literal("YieldExpression"),
    delegate: Schema.Literal(true),
    argument: Schema.Unknown,
  }),
)

const isDeclared = Schema.is(
  Schema.Struct({
    type: Schema.Literal("VariableDeclarator"),
    id: Named,
    init: Schema.Unknown,
  }),
)

const isCapital = (name: string): boolean => /^[A-Z]/.test(name)

const serviceName = (argument: unknown): ReadonlyArray<string> => {
  if (isNamed(argument)) return isCapital(argument.name) ? [argument.name] : []
  if (!isMember(argument)) return []
  if (!isCapital(argument.object.name) || !isCapital(argument.property.name)) return []

  return [`${argument.object.name}.${argument.property.name}`]
}

const childrenOf = (node: object): ReadonlyArray<unknown> =>
  Object.values(node).flatMap((value) => Array.ensure(value))

const everyNode = (node: unknown): ReadonlyArray<object> =>
  isNode(node) ? [node, ...childrenOf(node).flatMap(everyNode)] : []

const yieldedIn = (node: unknown, declared: ReadonlyMap<string, unknown>): ReadonlyArray<string> =>
  everyNode(node).flatMap((inner) => {
    if (isYielded(inner)) return serviceName(inner.argument)
    if (!isNamed(inner)) return []

    return Option.match(Option.fromUndefinedOr(declared.get(inner.name)), {
      onNone: () => [],
      onSome: (init) => yieldedIn(init, new Map()),
    })
  })

const isComposeCall = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.Literal("compose") }),
    arguments: Schema.NonEmptyArray(Node),
  }),
)

const isEnhancerCall = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({ name: Schema.Literals(["withStore", "withQuery"]) }),
    arguments: Schema.Array(Schema.Unknown),
  }),
)

const givenTo = (argument: unknown): ReadonlyArray<string> => {
  if (!isEnhancerCall(argument)) return []

  return serviceName(argument.arguments[argument.callee.name === "withStore" ? 0 : 1])
}

export const composeNeeds = (
  args: ReadonlyArray<unknown>,
  declared: ReadonlyMap<string, unknown>,
): ReadonlyArray<string> =>
  Array.dedupe(args.flatMap((given) => [...givenTo(given), ...yieldedIn(given, declared)]))

export { everyNode, isDeclared, isNamed, isMember, isCapital }

const listed = (services: ReadonlyArray<string>): string =>
  services.map((name) => `"${name}"`).join(",")

export const describeServices = (file: string, source: string): string => {
  const program: unknown = parseSync(file, source).program
  const nodes = everyNode(program)
  const declared = new Map(
    nodes.flatMap((node) => (isDeclared(node) ? [[node.id.name, node.init] as const] : [])),
  )
  const starts = nodes.flatMap((node) => {
    if (!isComposeCall(node)) return []

    const services = Array.dedupe(
      node.arguments.flatMap((given) => [...givenTo(given), ...yieldedIn(given, declared)]),
    )

    return [{ at: node.arguments[0].start, text: `__sparUses([${listed(services)}]), ` }]
  })
  const edited = starts
    .toSorted((left, right) => right.at - left.at)
    .reduce((text, edit) => `${text.slice(0, edit.at)}${edit.text}${text.slice(edit.at)}`, source)

  return starts.length === 0 ? edited : `import { uses as __sparUses } from "spar"; ${edited}`
}

export const mentionsComponents = (source: string): boolean => source.includes("compose(")
