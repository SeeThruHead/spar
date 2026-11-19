import * as Path from "node:path"
import { Predicate } from "effect"

type Loc = { readonly start: { readonly line: number }; readonly end: { readonly line: number } }

type Node = { readonly type: string; readonly loc: Loc; readonly parent?: Node | null }

type Report = { readonly node: Node; readonly message: string }

type Context = {
  readonly filename: string
  readonly report: (report: Report) => void
  readonly sourceCode: { readonly getAllComments: () => ReadonlyArray<Node> }
}

type Visitor = Readonly<Record<string, (node: Node) => void>>

type Rule = {
  readonly meta: { readonly type: "problem" }
  readonly create: (context: Context) => Visitor
}

const isNode = (value: unknown): value is Node =>
  Predicate.hasProperty(value, "type") && Predicate.isString(value.type)

const field = (node: unknown, key: string): unknown =>
  Predicate.hasProperty(node, key) ? node[key] : undefined

const nameOf = (node: unknown): string | undefined => {
  const name = field(node, "name")

  return Predicate.isString(name) ? name : undefined
}

const memberParts = (
  node: unknown,
): { readonly object: string | undefined; readonly property: string | undefined } => ({
  object: nameOf(field(node, "object")),
  property: nameOf(field(node, "property")),
})

const isFunction = (node: Node): boolean =>
  ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)

const enclosingFunction = (node: Node): Node | undefined => {
  const parent = node.parent
  if (parent === undefined || parent === null) return undefined

  return isFunction(parent) ? parent : enclosingFunction(parent)
}

const setsOwnFieldWhileConstructing = (node: Node): boolean => {
  if (field(field(field(node, "left"), "object"), "type") !== "ThisExpression") return false

  return field(enclosingFunction(node)?.parent, "kind") === "constructor"
}

const rule = (create: (context: Context) => Visitor): Rule => ({
  meta: { type: "problem" },
  create,
})

const reportAll =
  (context: Context, message: string) =>
  (node: Node): void =>
    context.report({ node, message })

const posix = (file: string): string => file.split(Path.sep).join("/")

const entryPoints = /\/(?:scripts|tools)\/[^/]+\.ts$|\/src\/(?:[^/]+\/)?main\.ts$/

const isEntryPoint = (file: string): boolean => entryPoints.test(posix(file))

const mutatingMethods = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
])

const locatorMethods = /^(getBy[A-Z]\w*|locator|first|last|nth|filter)$/

const isLocator = (node: unknown): boolean => {
  const callee = field(node, "callee")
  const property = nameOf(field(callee, "property"))

  return property !== undefined && locatorMethods.test(property)
}

const isModuleName = (name: string | undefined): boolean =>
  name !== undefined && /^[A-Z]/.test(name)

const freshValueTypes = new Set([
  "ObjectExpression",
  "ArrayExpression",
  "ArrowFunctionExpression",
  "FunctionExpression",
])

const isFreshValue = (node: unknown): boolean => isNode(node) && freshValueTypes.has(node.type)

const nestedInIf = (node: Node): boolean => {
  const parent: unknown = node.parent
  if (!isNode(parent)) return false
  if (isFunction(parent)) return false
  if (parent.type === "IfStatement" && field(parent, "alternate") === node)
    return nestedInIf(parent)
  if (parent.type === "IfStatement") return true

  return nestedInIf(parent)
}

const isEffectGenCall = (node: unknown): boolean => {
  if (!isNode(node) || node.type !== "CallExpression") return false
  const parts = memberParts(field(node, "callee"))

  return parts.object === "Effect" && parts.property === "gen"
}

const returnsOnlyEffectGen = (body: unknown): boolean => {
  if (isEffectGenCall(body)) return true
  if (!isNode(body) || body.type !== "BlockStatement") return false

  const statements = field(body, "body")
  if (!Array.isArray(statements) || statements.length !== 1) return false

  return isEffectGenCall(field(statements[0], "argument"))
}

const isThunkArgument = (node: Node): boolean => {
  const params = field(node, "params")
  if (!Array.isArray(params) || params.length > 0) return false

  return node.parent?.type === "CallExpression"
}

const isAsConst = (node: Node): boolean =>
  nameOf(field(field(node, "typeAnnotation"), "typeName")) === "const"

const runtimes = new Set(["Effect", "BunRuntime", "NodeRuntime", "BrowserRuntime"])

const nondeterministic = new Set(["Date.now", "Math.random", "crypto.randomUUID"])

const rules: Readonly<Record<string, Rule>> = {
  "no-loops": rule((context) => {
    const report = reportAll(context, "no loops; use Array methods, Effect.forEach or recursion")

    return {
      ForStatement: report,
      ForInStatement: report,
      ForOfStatement: report,
      WhileStatement: report,
      DoWhileStatement: report,
    }
  }),

  "no-let": rule((context) => ({
    VariableDeclaration: (node) => {
      const kind = field(node, "kind")
      if (kind !== "let" && kind !== "var") return

      context.report({ node, message: "const only; no let or var" })
    },
  })),

  "no-mutation": rule((context) => ({
    CallExpression: (node) => {
      const callee = field(node, "callee")
      const parts = memberParts(callee)
      const args = field(node, "arguments")
      const first = Array.isArray(args) ? args[0] : undefined

      if (parts.object === "Object" && parts.property === "assign" && !isFreshValue(first))
        return context.report({
          node,
          message: "Object.assign onto an existing value mutates it; spread into a new object",
        })
      if (parts.property === undefined || !mutatingMethods.has(parts.property)) return
      if (isModuleName(parts.object)) return
      if (parts.property === "fill" && isLocator(field(callee, "object"))) return

      context.report({
        node,
        message: `${parts.property}() mutates in place; use a non-mutating alternative (toSorted, toReversed, spread)`,
      })
    },
    AssignmentExpression: (node) => {
      if (field(field(node, "left"), "type") !== "MemberExpression") return
      if (setsOwnFieldWhileConstructing(node)) return

      context.report({
        node,
        message: "no property assignment; build a new value (DOM writes live in internal/dom.ts)",
      })
    },
    UpdateExpression: reportAll(context, "no ++ or --; build a new value"),
  })),

  "no-comments": rule((context) => ({
    Program: () =>
      context.sourceCode
        .getAllComments()
        .forEach(reportAll(context, "no comments; names, types and structure carry the meaning")),
  })),

  "no-nested-if": rule((context) => ({
    IfStatement: (node) => {
      if (!nestedInIf(node)) return

      context.report({ node, message: "no nested if; use guard clauses or a named helper" })
    },
  })),

  "no-multiline-logical": rule((context) => ({
    LogicalExpression: (node) => {
      if (node.parent?.type === "LogicalExpression") return
      if (field(node, "operator") === "??") return
      if (node.loc.start.line === node.loc.end.line) return

      context.report({
        node,
        message:
          "no multi-line && / || chains; move the condition into a named helper of guard clauses",
      })
    },
  })),

  "no-casts": rule((context) => ({
    TSAsExpression: (node) => {
      if (isAsConst(node)) return

      context.report({ node, message: "no casts; restructure until it typechecks" })
    },
    TSTypeAssertion: reportAll(context, "no casts; restructure until it typechecks"),
  })),

  deterministic: rule((context) => ({
    NewExpression: (node) => {
      if (nameOf(field(node, "callee")) !== "Date") return

      context.report({ node, message: "use DateTime and Clock, never Date" })
    },
    MemberExpression: (node) => {
      const parts = memberParts(node)
      if (!nondeterministic.has(`${parts.object}.${parts.property}`)) return

      context.report({
        node,
        message: "use the Clock and Crypto services so time and randomness stay deterministic",
      })
    },
  })),

  "run-at-entry-only": rule((context) => ({
    MemberExpression: (node) => {
      const parts = memberParts(node)
      if (parts.object === undefined || !runtimes.has(parts.object)) return
      if (parts.property === undefined || !parts.property.startsWith("run")) return
      if (isEntryPoint(context.filename)) return

      context.report({
        node,
        message: "Effect.run* and runMain belong only in src/main.ts and scripts/ or tools/ files",
      })
    },
  })),

  "no-gen-wrapper": rule((context) => {
    const check = (node: Node) => {
      if (isThunkArgument(node)) return
      if (!returnsOnlyEffectGen(field(node, "body"))) return

      context.report({
        node,
        message: "a function that only returns Effect.gen should be Effect.fn or Effect.fnUntraced",
      })
    }

    return { FunctionDeclaration: check, FunctionExpression: check, ArrowFunctionExpression: check }
  }),
}

export const codeOf = (name: string): string => `HOUSE_${name.toUpperCase().replaceAll("-", "_")}`

export const guides: Readonly<Record<string, { readonly what: string; readonly fix: string }>> = {
  "no-loops": {
    what: "A for, for-in, for-of, while or do-while loop.",
    fix: "Use Array methods, Effect.forEach or recursion.",
  },
  "no-let": {
    what: "A let or var declaration.",
    fix: "Use const. Where a value is built in steps, give each step its own name or use a reduce.",
  },
  "no-mutation": {
    what: "A property assignment, Object.assign onto an existing value, or a method that changes an array in place.",
    fix: "Build a new value: spread into a new object or array, or use toSorted, toReversed and the like.",
  },
  "no-comments": {
    what: "A comment in the code.",
    fix: "Remove it and let names, types and structure carry the meaning.",
  },
  "no-nested-if": {
    what: "An if inside an if.",
    fix: "Use guard clauses that return early, or move the inner condition into a named helper.",
  },
  "no-multiline-logical": {
    what: "A chain of && or || that runs over several lines.",
    fix: "Move the condition into a named helper made of one-line guard clauses.",
  },
  "no-casts": {
    what: "A type cast (as, or an angle-bracket assertion).",
    fix: "Restructure until it typechecks: decode with a Schema, narrow with a guard, or fix the type at its source.",
  },
  deterministic: {
    what: "Date, Date.now, Math.random or crypto used directly.",
    fix: "Use DateTime and the Clock and Crypto services, so time and randomness can be set in a test.",
  },
  "run-at-entry-only": {
    what: "Effect.run* or runMain outside an entry point.",
    fix: "Return the Effect and let src/main.ts, or a file in scripts/ or tools/, run it.",
  },
  "no-gen-wrapper": {
    what: "A function whose whole body returns Effect.gen.",
    fix: "Write it as Effect.fn or Effect.fnUntraced.",
  },
}

const coded = (name: string, made: Rule): Rule => ({
  meta: made.meta,
  create: (context) =>
    made.create({
      filename: context.filename,
      sourceCode: context.sourceCode,
      report: ({ node, message }) =>
        context.report({
          node,
          message: `[${codeOf(name)}] ${message}. See LLMS.md, section "${codeOf(name)}"`,
        }),
    }),
})

export default {
  meta: { name: "house" },
  rules: Object.fromEntries(Object.entries(rules).map(([name, made]) => [name, coded(name, made)])),
}
