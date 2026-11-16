import { Option, Predicate, Schema } from "effect"

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

const nodesOf = (node: ChildNode, end: ChildNode): ReadonlyArray<ChildNode> => {
  if (node === end) return [node]

  return [
    node,
    ...Option.toArray(Option.fromNullishOr(node.nextSibling)).flatMap((next) => nodesOf(next, end)),
  ]
}

const movedKeepingState = (parent: Node, node: ChildNode, before: Node): boolean => {
  const moveBefore: unknown = Reflect.get(parent, "moveBefore")
  if (!Predicate.isFunction(moveBefore)) return false

  try {
    Reflect.apply(moveBefore, parent, [node, before])

    return true
  } catch {
    return false
  }
}

const moveNode = (parent: Node, node: ChildNode, before: Node): void => {
  if (movedKeepingState(parent, node, before)) return

  insert(parent, node, before)
}

const moveSpan = (parent: Node, span: Span, before: Node): void =>
  nodesOf(span.start, span.end).forEach((node) => moveNode(parent, node, before))

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

const firstEntry = "first"

export const historyEntry = (): string => {
  const state: unknown = window.history.state
  const entry: unknown = Predicate.hasProperty(state, "sparEntry") ? state.sparEntry : firstEntry

  return Predicate.isString(entry) ? entry : firstEntry
}

const scrollKey = (entry: string): string => `spar/scroll/${entry}`

const Position = Schema.fromJsonString(Schema.Tuple([Schema.Finite, Schema.Finite]))

const savedPosition = Schema.decodeUnknownOption(Position)

const origin: typeof Position.Type = [0, 0]

export const rememberScroll = (entry: string): void => {
  sessionStorage.setItem(
    scrollKey(entry),
    Schema.encodeSync(Position)([window.scrollX, window.scrollY]),
  )
}

const entryCount = "spar/scroll/entries"

const countSoFar = Schema.decodeUnknownOption(Schema.FiniteFromString)

const nextEntry = (): string => {
  const next = Option.getOrElse(countSoFar(sessionStorage.getItem(entryCount)), () => 0) + 1

  sessionStorage.setItem(entryCount, String(next))

  return String(next)
}

export const pushEntry = (url: string): void => {
  window.history.pushState({ sparEntry: nextEntry() }, "", url)
  window.scrollTo(0, 0)
}

export const replaceEntry = (url: string): void => {
  window.history.replaceState(window.history.state, "", url)
}

export const restoreScroll = (): boolean => {
  const [left, top] = Option.getOrElse(
    savedPosition(sessionStorage.getItem(scrollKey(historyEntry()))),
    () => origin,
  )

  window.scrollTo(left, top)

  return Math.abs(window.scrollY - top) < 2
}

export const scrollByHand = (): (() => void) => {
  const before = window.history.scrollRestoration

  window.history.scrollRestoration = "manual"

  return () => {
    window.history.scrollRestoration = before
  }
}

export const measure = (node: Host): Box => {
  const { x, y, width, height } = node.getBoundingClientRect()

  return { x, y, width, height }
}

const isHtml = (node: unknown): node is HTMLElement => node instanceof HTMLElement

export const addOverlayRoot = (): HTMLElement => {
  const root = document.createElement("div")
  root.setAttribute("data-spar-overlays", "")

  return document.body.appendChild(root)
}

export const addLayer = (overlays: HTMLElement): HTMLElement => {
  const layer = document.createElement("div")
  layer.tabIndex = -1

  return overlays.appendChild(layer)
}

export const isTopLayer = (overlays: HTMLElement, layer: HTMLElement): boolean =>
  overlays.lastElementChild === layer

export const holds = (node: Node, target: EventTarget | null): boolean =>
  target instanceof Node && node.contains(target)

export const openModal = (
  frame: { readonly target: HTMLElement; readonly overlays: HTMLElement },
  layer: HTMLElement,
): (() => void) => {
  const layers = [...frame.overlays.children].filter(isHtml)
  const beneath = [frame.target, ...layers.slice(0, layers.indexOf(layer))]
  const wasInert = beneath.map((node) => node.hasAttribute("inert"))
  const hadFocus = [document.activeElement].filter(isHtml)
  const overflow = document.documentElement.style.overflow

  beneath.forEach((node) => node.toggleAttribute("inert", true))
  document.documentElement.style.overflow = "hidden"

  return () => {
    beneath.forEach((node, index) => node.toggleAttribute("inert", wasInert[index] === true))
    document.documentElement.style.overflow = overflow
    hadFocus.forEach((node) => node.focus())
  }
}

const focusable =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const isTab = (event: Event): event is KeyboardEvent =>
  event instanceof KeyboardEvent && event.key === "Tab"

export const keepTabInside = (layer: HTMLElement, event: Event): void => {
  if (!isTab(event)) return

  const stops = [...layer.querySelectorAll<HTMLElement>(focusable)]
  const edge = event.shiftKey ? stops.at(0) : stops.at(-1)
  const wrapTo = event.shiftKey ? stops.at(-1) : stops.at(0)

  if (document.activeElement !== edge) return

  event.preventDefault()
  ;[wrapTo].filter(isHtml).forEach((stop) => stop.focus())
}

export const listen = (
  node: Host,
  type: string,
  listener: (event: Event) => void,
): (() => void) => {
  node.addEventListener(type, listener)

  return () => node.removeEventListener(type, listener)
}
