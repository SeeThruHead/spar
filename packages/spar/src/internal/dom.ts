import { Option, Predicate } from "effect"

const properties: ReadonlySet<string> = new Set(["value", "checked"])

const isPrintable = Predicate.or(
  Predicate.isNumber,
  Predicate.or(Predicate.isBigInt, Predicate.isBoolean),
)

export const toText = (value: unknown): string => {
  if (Predicate.isString(value)) return value
  if (isPrintable(value)) return `${value}`

  return ""
}

export const insert = (parent: Node, node: Node, before: Node | null): void => {
  parent.insertBefore(node, before)
}

export const setText = (node: Text, value: unknown): void => {
  node.data = toText(value)
}

const setProperty = (node: HTMLElement, name: string, value: unknown): void => {
  if (Reflect.get(node, name) === value) return

  Reflect.set(node, name, value)
}

export const setAttribute = (node: HTMLElement, name: string, value: unknown): void => {
  if (properties.has(name)) return setProperty(node, name, value)
  if (value === false || Predicate.isNullish(value)) return node.removeAttribute(name)

  return node.setAttribute(name, value === true ? "" : toText(value))
}

export const span = (start: Node, end: Node): ReadonlyArray<Node> => {
  if (start === end) return [end]

  return Option.match(Option.fromNullishOr(start.nextSibling), {
    onNone: () => [start],
    onSome: (next) => [start, ...span(next, end)],
  })
}

export const removeSpan = (parent: Node, start: Node, end: Node): void => {
  span(start, end).forEach((node) => parent.removeChild(node))
}

export const placeSpans = (
  parent: Node,
  spans: ReadonlyArray<{ readonly start: Node; readonly end: Node }>,
  anchor: Node,
): void => {
  spans.reduceRight<Node>(
    (cursor, each) =>
      span(each.start, each.end).reduceRight<Node>((next, node) => {
        if (node.nextSibling !== next) parent.insertBefore(node, next)

        return node
      }, cursor),
    anchor,
  )
}

export const clear = (target: Node & ParentNode): void => {
  target.replaceChildren()
}
