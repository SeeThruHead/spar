import { Option, Predicate, Schema } from "effect"
import * as Cell from "./cell.ts"

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

export const create = (page: Document, tag: string, namespace: Namespace): Host => {
  if (namespace === "svg") return page.createElementNS(svgNamespace, tag)

  return page.createElement(tag)
}

export const insert = (parent: Node, node: Node, before: Node | null): void => {
  parent.insertBefore(node, before)
}

export const setText = (node: Text, value: unknown): void => {
  node.data = toText(value)
}

const isProperty = (node: Host, name: string): boolean => {
  if (node.namespaceURI === svgNamespace) return name === "tabIndex"
  if (attributeNames.test(name)) return false

  return name in node
}

const isScalar = Predicate.or(isAttributeText, Predicate.or(Predicate.isBoolean, Predicate.isNull))

const wouldOnlyMoveTheCaret = (node: Host, name: string, value: unknown): boolean =>
  name === "value" && Reflect.get(node, name) === value

const setProperty = (node: Host, name: string, value: unknown): void => {
  if (!isScalar(value)) return
  if (wouldOnlyMoveTheCaret(node, name, value)) return

  Reflect.set(node, name, value)
}

const booleanText = (name: string, value: boolean): string | undefined => {
  if (name.startsWith("aria-")) return `${value}`

  return value ? "" : undefined
}

export const attributeText = (name: string, value: unknown): string | undefined => {
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

export const setMarkup = (node: Host, html: string): void => {
  node.innerHTML = html
}

export const setTitle = (text: string): void => {
  document.title = text
}

export const toggleClass = (node: Host, names: string, on: unknown): void => {
  names
    .split(/\s+/)
    .filter((name) => name.length > 0)
    .forEach((name) => node.classList.toggle(name, on === true))
}

export const cssName = (name: string): string => {
  if (name.startsWith("--")) return name

  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

export const styleText = (value: unknown): string | undefined =>
  isAttributeText(value) ? toText(value) : undefined

export const setStyle = (node: Host, name: string, value: unknown): void => {
  const text = styleText(value)
  if (text === undefined) return void node.style.removeProperty(cssName(name))

  node.style.setProperty(cssName(name), text)
}

const nodesOf = (node: ChildNode, end: ChildNode): ReadonlyArray<ChildNode> => {
  if (node === end) return [node]

  return [
    node,
    ...Option.toArray(Option.fromNullishOr(node.nextSibling)).flatMap((next) => nodesOf(next, end)),
  ]
}

export const removeSpan = (span: Span): void => {
  if (span.start === span.end) return span.start.remove()

  nodesOf(span.start, span.end).forEach((node) => node.remove())
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

export const focusInPlace = (node: Host): void => {
  node.focus({ preventScroll: true })
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
  const beneath = [frame.target, ...layers.slice(0, layers.indexOf(layer))].filter(
    (node) => node.querySelector("[data-spar-above-modals]") === null,
  )
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

export const listStart = "["

export const listEnd = "]"

export const textBreak = ","

export const partStart = "spar("

export const partEnd = "spar)"

export type Cursor = { next: ChildNode | null }

export const cursorIn = (parent: Node): Cursor => ({ next: parent.firstChild })

const isComment = (node: Node | null, data: string): node is Comment =>
  node instanceof Comment && node.data === data

const taken = <A extends ChildNode>(cursor: Cursor, node: A): A => {
  cursor.next = node.nextSibling

  return node
}

const skipTextBreak = (cursor: Cursor): void => {
  const node = cursor.next
  if (!isComment(node, textBreak)) return

  taken(cursor, node).remove()
}

const isMark = (node: Node | null): node is Comment =>
  isComment(node, partStart) || isComment(node, partEnd)

const dropMarks = (cursor: Cursor): void => {
  const node = cursor.next
  if (!isMark(node)) return

  taken(cursor, node).remove()
  dropMarks(cursor)
}

const isHost = (node: Node | null): node is Host =>
  node instanceof HTMLElement || node instanceof SVGElement

export const claimElement = (cursor: Cursor, tag: string): Host | undefined => {
  dropMarks(cursor)

  const node = cursor.next
  if (!isHost(node)) return undefined
  if (node.localName !== tag.toLowerCase() && node.localName !== tag) return undefined

  return taken(cursor, node)
}

export const claimText = (cursor: Cursor, parent: Node): Text => {
  dropMarks(cursor)
  skipTextBreak(cursor)

  const node = cursor.next
  if (node instanceof Text) return taken(cursor, node)

  return parent.insertBefore(document.createTextNode(""), node)
}

export const claimComment = (cursor: Cursor, parent: Node, data: string): Comment => {
  dropMarks(cursor)

  const node = cursor.next
  if (isComment(node, data)) return taken(cursor, node)

  return parent.insertBefore(document.createComment(data), node)
}

const closing = (node: ChildNode | null, depth: number): Comment | undefined => {
  if (node === null) return undefined
  if (isComment(node, listEnd) && depth === 0) return node
  if (isComment(node, listEnd)) return closing(node.nextSibling, depth - 1)
  if (isComment(node, listStart)) return closing(node.nextSibling, depth + 1)

  return closing(node.nextSibling, depth)
}

export const claimList = (
  cursor: Cursor,
  parent: Node,
): { readonly anchor: Comment; readonly rows: Cursor } => {
  dropMarks(cursor)

  const start = cursor.next
  const end = isComment(start, listStart) ? closing(start.nextSibling, 0) : undefined
  if (!isComment(start, listStart) || end === undefined) {
    const anchor = parent.insertBefore(document.createComment(""), start)

    return { anchor, rows: { next: anchor } }
  }

  const rows = { next: start.nextSibling }

  start.remove()
  end.data = ""
  cursor.next = end.nextSibling

  return { anchor: end, rows }
}

const dropFrom = (node: ChildNode | null, until: Node | null): void => {
  if (node === null || node === until) return

  const following = node.nextSibling

  node.remove()
  dropFrom(following, until)
}

export const dropRest = (cursor: Cursor, until: Node | null): void => {
  dropFrom(cursor.next, until)
  cursor.next = null
}

export const insertionPoint = (cursor: Cursor | undefined, before: Node | null): Node | null =>
  cursor === undefined ? before : cursor.next

export const markedAt = (
  x: number,
  y: number,
  attribute: string,
  outside: string,
): number | null => {
  const under = document
    .elementsFromPoint(x, y)
    .filter((node) => node.closest(outside) === null)
    .flatMap((node) => {
      const owner = node.closest(`[${attribute}]`)

      return owner === null ? [] : [Number(owner.getAttribute(attribute))]
    })

  return under[0] ?? null
}

export const boxAround = (attribute: string, id: number): Box | null => {
  const boxes = [...document.querySelectorAll(`[${attribute}="${id}"]`)].map((node) =>
    node.getBoundingClientRect(),
  )
  if (boxes.length === 0) return null

  const left = Math.min(...boxes.map((box) => box.left))
  const top = Math.min(...boxes.map((box) => box.top))

  return {
    x: left + window.scrollX,
    y: top + window.scrollY,
    width: Math.max(...boxes.map((box) => box.right)) - left,
    height: Math.max(...boxes.map((box) => box.bottom)) - top,
  }
}

export const markTaken = (target: Element, attribute: string): void => {
  target.setAttribute(attribute, "")
}

export const waitingPieces = (name: string): unknown => Reflect.get(globalThis, name)

export const takePieces = (name: string, onPiece: (piece: unknown) => void): void => {
  const waiting: unknown = Reflect.get(globalThis, name)

  Reflect.set(globalThis, name, { push: onPiece })
  Array.from(Array.isArray(waiting) ? waiting : []).forEach(onPiece)
}

const events = Cell.make(0)

export const nextEvent = (): number => {
  events.write(events.read() + 1)

  return events.read()
}

const typedAt = new WeakMap<object, number>()

const watched = new WeakSet<object>()

export const watchTyping = (page: Document): void => {
  if (watched.has(page)) return

  watched.add(page)
  page.addEventListener(
    "input",
    (event) => {
      Option.map(Option.fromNullOr(event.target), (field) => typedAt.set(field, nextEvent()))
    },
    true,
  )
}

const typedIn = new Set(["text", "search", "email", "url", "tel", "password", "number", ""])

const isTextEntry = (node: Host): boolean => {
  if (node.localName === "textarea") return true
  if (node.localName !== "input") return false

  return typedIn.has(node.getAttribute("type") ?? "")
}

export const typingReplaced = (
  node: Host,
  name: string,
  value: unknown,
  causedAt: Option.Option<number>,
): boolean => {
  if (name !== "value" || Reflect.get(node, "value") === value) return false
  if (!isTextEntry(node)) return false

  return Option.exists(causedAt, (cause) => (typedAt.get(node) ?? 0) > cause)
}

export const described = (node: Host): string =>
  [
    node.localName,
    ...["name", "aria-label", "id"].flatMap((attribute) =>
      Option.toArray(
        Option.map(
          Option.fromNullOr(node.getAttribute(attribute)),
          (text) => `[${attribute}="${text}"]`,
        ),
      ),
    ),
  ]
    .slice(0, 2)
    .join("")

export const whenParsed = (then: () => void): void => {
  if (document.readyState !== "loading") return then()

  document.addEventListener("DOMContentLoaded", then, { once: true })
}

export const textOf = (id: string): string | null =>
  document.getElementById(id)?.textContent ?? null
