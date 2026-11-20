import { Context, Effect, Predicate } from "effect"
import type { Scope } from "effect"
import * as Cell from "./cell.ts"
import * as Dom from "./dom.ts"
import { TypeId, isElement } from "./element.ts"
import type { Element, Intrinsic, Rows } from "./element.ts"
import { isHandle } from "./handle.ts"
import { fromCell, isReactive } from "./reactive.ts"
import * as Markup from "../Markup.ts"

type Piece = { readonly text: boolean; readonly html: string }

type Pieces = Effect.Effect<ReadonlyArray<Piece>, never, Scope.Scope>

const comment = (data: string): string => `<!--${data}-->`

const escaped = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

const voids: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
])

const attributeName = (name: string): string => name.toLowerCase()

const isEventName = (name: string): boolean => /^on[A-Z]/.test(name)

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Predicate.isReadonlyObject(value) && !isReactive(value)

const now = (value: unknown): Effect.Effect<unknown> =>
  isReactive(value) ? value.get : Effect.succeed(value)

const eachNow = (record: Readonly<Record<string, unknown>>) =>
  Effect.forEach(Object.entries(record), ([name, value]) =>
    Effect.map(now(value), (current) => [name, current] as const),
  )

const attribute = (name: string, text: string | undefined): string =>
  text === undefined ? "" : ` ${name}="${escaped(text)}"`

const classText = (pairs: ReadonlyArray<readonly [string, unknown]>): string =>
  pairs.flatMap(([names, on]) => (on === true ? [names.trim()] : [])).join(" ")

const styleText = (pairs: ReadonlyArray<readonly [string, unknown]>): string =>
  pairs
    .flatMap(([property, value]) => {
      const text = Dom.styleText(value)

      return text === undefined ? [] : [`${Dom.cssName(property)}: ${text}`]
    })
    .join("; ")

const attributeOf = (name: string, value: unknown): Effect.Effect<string> => {
  if (name === "children" || name === "markup") return Effect.succeed("")
  if (isEventName(name) || isHandle(value)) return Effect.succeed("")
  if (name === "class" && isRecord(value)) {
    return Effect.map(eachNow(value), (pairs) => attribute("class", classText(pairs)))
  }
  if (name === "style" && isRecord(value)) {
    return Effect.map(eachNow(value), (pairs) => attribute("style", styleText(pairs)))
  }

  return Effect.map(now(value), (current) =>
    attribute(attributeName(name), Dom.attributeText(name, current)),
  )
}

const joined = (pieces: ReadonlyArray<Piece>): string =>
  pieces
    .map((piece, index) =>
      piece.text && pieces[index - 1]?.text === true
        ? `${comment(Dom.textBreak)}${piece.html}`
        : piece.html,
    )
    .join("")

const textPiece = (value: unknown): Piece => ({ text: true, html: escaped(Dom.toText(value)) })

const solid = (html: string): ReadonlyArray<Piece> => [{ text: false, html }]

const intrinsic: (element: Intrinsic) => Pieces = Effect.fnUntraced(function* (element: Intrinsic) {
  const attributes = yield* Effect.forEach(Object.entries(element.props), ([name, value]) =>
    attributeOf(name, value),
  )
  const open = `<${element.tag}${attributes.join("")}>`
  if (voids.has(element.tag)) return solid(open)
  if (element.props["markup"] !== undefined) {
    const html = yield* now(element.props["markup"])

    return solid(`${open}${Markup.htmlOf(html)}</${element.tag}>`)
  }

  const inside = yield* pieces(element.props["children"])

  return solid(`${open}${joined(inside)}</${element.tag}>`)
})

export const Marked = Context.Reference<boolean>("spar/internal/html/Marked", {
  defaultValue: () => false,
})

const plain = (element: Element): Effect.Effect<string, never, Scope.Scope> => {
  if (element[TypeId] === "Intrinsic") return Effect.map(intrinsic(element), joined)

  return Effect.map(pieces(element), (inside) => `${comment("")}${joined(inside)}${comment("")}`)
}

const span = (element: Element): Effect.Effect<string, never, Scope.Scope> =>
  Effect.flatMap(Effect.service(Marked), (marked) =>
    Effect.map(plain(element), (html) =>
      marked ? `${comment(Dom.partStart)}${html}${comment(Dom.partEnd)}` : html,
    ),
  )

const rowElement = <A>(rows: Rows<A>, item: A): Effect.Effect<Element, never, Scope.Scope> => {
  const key = rows.key(item)
  const shown = fromCell(Cell.make(item))

  return rows.kind === "drawn" ? Effect.sync(() => rows.draw(key, shown)) : rows.mount(key, shown)
}

const list = <A>(rows: Rows<A>): Pieces =>
  rows.items.get.pipe(
    Effect.flatMap(Effect.forEach((item) => Effect.flatMap(rowElement(rows, item), span))),
    Effect.map((all) => solid(`${comment(Dom.listStart)}${all.join("")}${comment(Dom.listEnd)}`)),
  )

const ofElement = (element: Element): Pieces => {
  if (element[TypeId] === "Intrinsic") return intrinsic(element)
  if (element[TypeId] === "Fragment") return pieces(element.children)
  if (element[TypeId] === "Portal") return Effect.succeed([])

  return element.open(list)
}

const pieces = (child: unknown): Pieces => {
  if (Predicate.isString(child) || Predicate.isNumber(child))
    return Effect.succeed([textPiece(child)])
  if (isReactive(child)) return Effect.map(child.get, (value) => [textPiece(value)])
  if (Array.isArray(child)) return Effect.map(Effect.forEach(child, pieces), (all) => all.flat())
  if (isElement(child)) return ofElement(child)

  return Effect.succeed([])
}

export const toHtml = (child: unknown): Effect.Effect<string, never, Scope.Scope> =>
  Effect.map(pieces(child), joined)
