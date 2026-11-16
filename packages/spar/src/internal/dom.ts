import { Predicate } from "effect"

export type Namespace = "html" | "svg"

export type Host = HTMLElement | SVGElement

export type Span = { readonly start: ChildNode; readonly end: ChildNode }

const svgNamespace = "http://www.w3.org/2000/svg"

const attributeNames = /^(aria-|data-)|^(role|class|for|style)$/

const isNumeric = Predicate.or(Predicate.isNumber, Predicate.isBigInt)

const isAttributeText = Predicate.or(Predicate.isString, isNumeric)

export const toText = (value: unknown): string => {
  if (Predicate.isString(value)) return value
  if (isNumeric(value)) return `${value}`

  return ""
}

export const create = (tag: string, namespace: Namespace): Host => {
  if (namespace === "svg") return document.createElementNS(svgNamespace, tag)

  return document.createElement(tag)
}

export const insert = (parent: Node, node: Node, before: Node | null): void => {
  parent.insertBefore(node, before)
}

export const setText = (node: Text, value: unknown): void => {
  node.data = toText(value)
}

const isProperty = (node: Host, name: string): boolean => {
  if (node instanceof SVGElement) return false
  if (attributeNames.test(name)) return false

  return name in node
}

const isScalar = Predicate.or(isAttributeText, Predicate.or(Predicate.isBoolean, Predicate.isNull))

const setProperty = (node: Host, name: string, value: unknown): void => {
  if (!isScalar(value)) return
  if (Reflect.get(node, name) === value) return

  Reflect.set(node, name, value)
}

const booleanText = (name: string, value: boolean): string | undefined => {
  if (name.startsWith("aria-")) return `${value}`

  return value ? "" : undefined
}

const attributeText = (name: string, value: unknown): string | undefined => {
  if (Predicate.isBoolean(value)) return booleanText(name, value)
  if (isAttributeText(value)) return toText(value)

  return undefined
}

export const setAttribute = (node: Host, name: string, value: unknown): void => {
  if (isProperty(node, name)) return setProperty(node, name, value)

  const text = attributeText(name, value)
  if (text === undefined) return node.removeAttribute(name)

  return node.setAttribute(name, text)
}

export const toggleClass = (node: Host, names: string, on: unknown): void => {
  names
    .split(/\s+/)
    .filter((name) => name.length > 0)
    .forEach((name) => node.classList.toggle(name, on === true))
}

const cssName = (name: string): string => {
  if (name.startsWith("--")) return name

  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

export const setStyle = (node: Host, name: string, value: unknown): void => {
  if (isAttributeText(value)) return node.style.setProperty(cssName(name), toText(value))

  node.style.removeProperty(cssName(name))
}

const rangeOf = (span: Span): Range => {
  const range = document.createRange()
  range.setStartBefore(span.start)
  range.setEndAfter(span.end)

  return range
}

export const removeSpan = (span: Span): void => {
  if (span.start === span.end) return span.start.remove()

  rangeOf(span).deleteContents()
}

const moveSpan = (parent: Node, span: Span, before: Node): void => {
  if (span.start === span.end) return insert(parent, span.start, before)

  insert(parent, rangeOf(span).extractContents(), before)
}

export const placeSpans = (
  parent: Node,
  spans: ReadonlyArray<Span>,
  settled: ReadonlySet<number>,
  anchor: Node,
): void => {
  spans.reduceRight<Node>((cursor, span, position) => {
    if (!settled.has(position)) moveSpan(parent, span, cursor)

    return span.start
  }, anchor)
}

export const clear = (target: Node & ParentNode): void => {
  target.replaceChildren()
}

export type Box = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const focus = (node: Host): void => {
  node.focus()
}

export const scrollIntoView = (node: Host): void => {
  node.scrollIntoView({ block: "nearest", inline: "nearest" })
}

export const measure = (node: Host): Box => {
  const { x, y, width, height } = node.getBoundingClientRect()

  return { x, y, width, height }
}
