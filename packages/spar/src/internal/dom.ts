import { Predicate } from "effect"

const properties: ReadonlySet<string> = new Set(["value", "checked"])

const isNumeric = Predicate.or(Predicate.isNumber, Predicate.isBigInt)

export const toText = (value: unknown): string => {
  if (Predicate.isString(value)) return value
  if (isNumeric(value)) return `${value}`

  return ""
}

const isAttributeText = Predicate.or(Predicate.isString, isNumeric)

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
  if (value === true) return node.setAttribute(name, "")
  if (isAttributeText(value)) return node.setAttribute(name, toText(value))

  return node.removeAttribute(name)
}

const rangeOf = (start: Node, end: Node): Range => {
  const range = document.createRange()
  range.setStartBefore(start)
  range.setEndAfter(end)

  return range
}

export const removeSpan = (start: Node, end: Node): void => {
  rangeOf(start, end).deleteContents()
}

export const placeSpans = (
  parent: Node,
  spans: ReadonlyArray<{ readonly start: Node; readonly end: Node }>,
  anchor: Node,
): void => {
  spans.reduceRight<Node>((cursor, each) => {
    if (each.end.nextSibling !== cursor) {
      parent.insertBefore(rangeOf(each.start, each.end).extractContents(), cursor)
    }

    return each.start
  }, anchor)
}

export const clear = (target: Node & ParentNode): void => {
  target.replaceChildren()
}
