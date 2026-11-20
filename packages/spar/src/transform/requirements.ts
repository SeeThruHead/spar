import { dirname, join } from "node:path"
import { Array, Option, Schema } from "effect"
import { parseSync } from "oxc-parser"
import * as Diagnostics from "../Diagnostics.ts"
import { composeNeeds, everyNode, isCapital, isDeclared } from "./services.ts"

export type Source = { readonly file: string; readonly source: string }

export type Unprovided = {
  readonly rule: "child-needs-a-service"
  readonly code: "SPAR_CHILD_NEEDS_A_SERVICE"
  readonly message: string
  readonly file: string
  readonly line: number
  readonly column: number
}

type Use = { readonly name: string; readonly at: number }

type Part = {
  readonly name: string
  readonly file: string
  readonly source: string
  readonly needs: ReadonlyArray<string>
  readonly gives: ReadonlyArray<string>
  readonly uses: ReadonlyArray<Use>
}

type Imported = { readonly file: string; readonly name: string }

type Facts = {
  readonly file: string
  readonly source: string
  readonly declared: ReadonlyMap<string, unknown>
  readonly imports: ReadonlyMap<string, Imported>
  readonly parts: ReadonlyMap<string, Part>
  readonly mounts: ReadonlyArray<{ readonly name: string; readonly layer: unknown }>
}

const Named = Schema.Struct({ type: Schema.Literal("Identifier"), name: Schema.String })

const isComposed = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      type: Schema.Literal("CallExpression"),
      callee: Schema.Struct({
        type: Schema.Literal("Identifier"),
        name: Schema.Literal("compose"),
      }),
      arguments: Schema.Array(Schema.Unknown),
    }),
  }),
)

const isBeside = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      type: Schema.Literal("MemberExpression"),
      object: Named,
      property: Schema.Struct({ name: Schema.Literals(["with", "beside"]) }),
    }),
  }),
)

const isName = Schema.is(
  Schema.Struct({
    type: Schema.Literals(["Identifier", "JSXIdentifier"]),
    name: Schema.String,
    start: Schema.Finite,
  }),
)

const isImport = Schema.is(
  Schema.Struct({
    type: Schema.Literal("ImportDeclaration"),
    source: Schema.Struct({ value: Schema.String }),
    specifiers: Schema.Array(Schema.Unknown),
  }),
)

const isSpecifier = Schema.is(
  Schema.Struct({
    type: Schema.Literal("ImportSpecifier"),
    local: Named,
    imported: Schema.Struct({ name: Schema.String }),
  }),
)

const isMount = Schema.is(
  Schema.Struct({
    type: Schema.Literal("CallExpression"),
    callee: Schema.Struct({
      type: Schema.Literal("MemberExpression"),
      object: Schema.Struct({ name: Schema.Literals(["App", "Server"]) }),
      property: Schema.Struct({
        name: Schema.Literals([
          "mount",
          "hydrate",
          "render",
          "renderToString",
          "renderToStream",
          "renderInPieces",
        ]),
      }),
    }),
    arguments: Schema.Tuple([Named, Schema.Struct({ properties: Schema.Array(Schema.Unknown) })]),
  }),
)

const isLayerOption = Schema.is(
  Schema.Struct({
    type: Schema.Literal("Property"),
    key: Schema.Struct({ name: Schema.Literal("layer") }),
    value: Schema.Unknown,
  }),
)

const isMember = Schema.is(
  Schema.Struct({
    type: Schema.Literal("MemberExpression"),
    object: Named,
    property: Schema.Struct({ name: Schema.String }),
  }),
)

const isRelative = (path: string): boolean => path.startsWith(".")

const fileFor = (from: string, path: string, known: ReadonlySet<string>): string | null => {
  const base = join(dirname(from), path)

  return [base, `${base}.ts`, `${base}.tsx`].find((candidate) => known.has(candidate)) ?? null
}

const importsOf = (
  file: string,
  nodes: ReadonlyArray<object>,
  known: ReadonlySet<string>,
): ReadonlyMap<string, Imported> =>
  new Map(
    nodes.flatMap((node) => {
      if (!isImport(node) || !isRelative(node.source.value)) return []

      const target = fileFor(file, node.source.value, known)
      if (target === null) return []

      return node.specifiers.flatMap((specifier) =>
        isSpecifier(specifier)
          ? [[specifier.local.name, { file: target, name: specifier.imported.name }] as const]
          : [],
      )
    }),
  )

const usesIn = (init: unknown, own: string): ReadonlyArray<Use> =>
  everyNode(init).flatMap((node) =>
    isName(node) && isCapital(node.name) && node.name !== own
      ? [{ name: node.name, at: node.start }]
      : [],
  )

type Where = {
  readonly file: string
  readonly source: string
  readonly declared: ReadonlyMap<string, unknown>
}

const partOf = (where: Where, name: string, init: unknown): Option.Option<Part> => {
  const inside = everyNode(init)
  const composed = inside.flatMap((node) => (isComposed(node) ? [node] : []))
  const beside = inside.flatMap((node) => (isBeside(node) ? [node.callee.object.name] : []))
  if (composed.length === 0 && beside.length === 0) return Option.none()

  return Option.some({
    name,
    file: where.file,
    source: where.source,
    needs: composed.flatMap((node) => composeNeeds(node.callee.arguments, where.declared)),
    gives: beside,
    uses: usesIn(init, name),
  })
}

const factsOf = (file: string, source: string, known: ReadonlySet<string>): Facts => {
  const nodes = everyNode(parseSync(file, source).program)
  const declarators = nodes.flatMap((node) => (isDeclared(node) ? [node] : []))
  const declared = new Map(declarators.map((node) => [node.id.name, node.init] as const))
  const parts = new Map(
    declarators.flatMap((node) =>
      Option.toArray(partOf({ file, source, declared }, node.id.name, node.init)).map(
        (part) => [part.name, part] as const,
      ),
    ),
  )
  const mounts = nodes.flatMap((node) => {
    if (!isMount(node)) return []

    const [component, options] = node.arguments

    return options.properties.flatMap((option) =>
      isLayerOption(option) ? [{ name: component.name, layer: option.value }] : [],
    )
  })

  return { file, source, declared, imports: importsOf(file, nodes, known), parts, mounts }
}

type World = ReadonlyMap<string, Facts>

const factsIn = (world: World, file: string): Option.Option<Facts> =>
  Option.fromUndefinedOr(world.get(file))

const partNamed = (world: World, file: string, name: string): Option.Option<Part> =>
  Option.flatMap(factsIn(world, file), (facts) =>
    Option.orElse(Option.fromUndefinedOr(facts.parts.get(name)), () =>
      Option.flatMap(Option.fromUndefinedOr(facts.imports.get(name)), (imported) =>
        partNamed(world, imported.file, imported.name),
      ),
    ),
  )

const declaredNamed = (
  world: World,
  file: string,
  name: string,
): Option.Option<{ readonly file: string; readonly init: unknown }> =>
  Option.flatMap(factsIn(world, file), (facts) =>
    facts.declared.has(name)
      ? Option.some({ file, init: facts.declared.get(name) })
      : Option.flatMap(Option.fromUndefinedOr(facts.imports.get(name)), (imported) =>
          declaredNamed(world, imported.file, imported.name),
        ),
  )

const memberNames = (node: {
  readonly object: { readonly name: string }
  readonly property: { readonly name: string }
}): ReadonlyArray<string> => {
  if (!isCapital(node.object.name)) return []
  if (!isCapital(node.property.name)) return [node.object.name]

  return [node.object.name, `${node.object.name}.${node.property.name}`]
}

const providedBy = (
  world: World,
  file: string,
  layer: unknown,
  followed: ReadonlySet<string>,
): ReadonlyArray<string> =>
  everyNode(layer).flatMap((node) => {
    if (isMember(node)) return memberNames(node)
    if (!isName(node) || followed.has(`${file}#${node.name}`)) return []

    const named = isCapital(node.name) ? [node.name] : []

    return Option.match(declaredNamed(world, file, node.name), {
      onNone: () => named,
      onSome: (found) => [
        ...named,
        ...providedBy(
          world,
          found.file,
          found.init,
          new Set([...followed, `${file}#${node.name}`, `${found.file}#${node.name}`]),
        ),
      ],
    })
  })

const covered = (need: string, provided: ReadonlySet<string>): boolean =>
  provided.has(need) || [...provided].some((given) => need.startsWith(`${given}.`))

const locate = (source: string, offset: number) => {
  const before = source.slice(0, offset)

  return { line: before.split("\n").length, column: offset - before.lastIndexOf("\n") }
}

const reported = (
  parent: Part,
  use: Use,
  child: Part,
  missing: ReadonlyArray<string>,
): Unprovided => {
  const what = Diagnostics.all.SPAR_CHILD_NEEDS_A_SERVICE

  return {
    rule: "child-needs-a-service",
    code: "SPAR_CHILD_NEEDS_A_SERVICE",
    message: `${child.name}, drawn in ${parent.name}, needs ${missing.join(", ")}. ${what.what} ${what.fix}`,
    file: parent.file,
    ...locate(parent.source, use.at),
  }
}

const walked = (
  world: World,
  part: Part,
  provided: ReadonlySet<string>,
  visited: ReadonlySet<string>,
): ReadonlyArray<Unprovided> => {
  const around = new Set([...provided, ...part.gives])

  return Array.dedupeWith(
    part.uses.flatMap((use) =>
      Option.toArray(
        Option.map(partNamed(world, part.file, use.name), (child) => ({ use, child })),
      ),
    ),
    (left, right) => left.child === right.child,
  ).flatMap(({ use, child }) => {
    const key = `${child.file}#${child.name}`
    if (visited.has(key)) return []

    const missing = child.needs.filter((need) => !covered(need, around))
    const here = missing.length === 0 ? [] : [reported(part, use, child, missing)]

    return [...here, ...walked(world, child, around, new Set([...visited, key]))]
  })
}

export const unprovided = (sources: ReadonlyArray<Source>): ReadonlyArray<Unprovided> => {
  const known = new Set(sources.map((source) => source.file))
  const world: World = new Map(
    sources.map((source) => [source.file, factsOf(source.file, source.source, known)] as const),
  )

  const found = [...world.values()].flatMap((facts) =>
    facts.mounts.flatMap((mount) =>
      Option.match(partNamed(world, facts.file, mount.name), {
        onNone: () => [],
        onSome: (top) =>
          walked(
            world,
            top,
            new Set(providedBy(world, facts.file, mount.layer, new Set())),
            new Set([`${top.file}#${top.name}`]),
          ),
      }),
    ),
  )

  return Array.dedupeWith(
    found,
    (left, right) =>
      left.file === right.file && left.line === right.line && left.message === right.message,
  )
}
