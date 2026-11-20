import { Array, Schema } from "effect"
import { parseSync } from "oxc-parser"

const isNode = Schema.is(Schema.Struct({ type: Schema.String }))

const isComposedComponent = Schema.is(
  Schema.Struct({
    type: Schema.Literal("VariableDeclarator"),
    id: Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.String }),
    init: Schema.Struct({
      type: Schema.Literal("CallExpression"),
      callee: Schema.Struct({
        type: Schema.Literal("CallExpression"),
        callee: Schema.Struct({ name: Schema.Literal("compose") }),
      }),
      arguments: Schema.Tuple([Schema.Struct({ end: Schema.Finite })]),
    }),
  }),
)

type Naming = { readonly at: number; readonly name: string }

const namings = (node: unknown): ReadonlyArray<Naming> => {
  if (isComposedComponent(node)) {
    return [{ at: node.init.arguments[0].end, name: node.id.name }]
  }
  if (!isNode(node)) return []

  return Object.values(node).flatMap((value) => Array.ensure(value).flatMap(namings))
}

export const named = (file: string, source: string): string | null => {
  if (!source.includes("compose(")) return null

  const found = namings(parseSync(file, source).program)
  if (found.length === 0) return null

  return found
    .toSorted((left, right) => right.at - left.at)
    .reduce((text, { at, name }) => `${text.slice(0, at)}, "${name}"${text.slice(at)}`, source)
}
