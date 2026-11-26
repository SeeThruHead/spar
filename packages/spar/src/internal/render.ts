import {
  Array as Arr,
  Effect,
  Exit,
  Function,
  Option,
  Predicate,
  Ref,
  Scheduler,
  Schema,
  Scope,
  Semaphore,
  SubscriptionRef,
} from "effect"
import { toAction } from "./action.ts"
import type { Action } from "./action.ts"
import * as Cell from "./cell.ts"
import { report } from "./crash.ts"
import * as Dom from "./dom.ts"
import { HandleTypeId, isHandle } from "./handle.ts"
import type { Handle } from "./handle.ts"
import { TypeId, isElement } from "./element.ts"
import type { Drawn, Element, Intrinsic, Mounted, Rows } from "./element.ts"
import { causedAt, starter, starterIn, traced } from "./listen.ts"
import { noticed } from "./notice.ts"
import { settled } from "./order.ts"
import { Direct, Observe, fromCell, isReactive } from "./reactive.ts"
import type { Reactive } from "./reactive.ts"
import { changedOne } from "./rows.ts"
import * as Diagnostics from "./said.ts"
import * as Markup from "../Markup.ts"

export class DuplicateKey extends Schema.TaggedError<
  DuplicateKey,
  { readonly brand: unique symbol }
>()("DuplicateKey", { keys: Schema.Array(Schema.String) }) {
  override get message() {
    return Diagnostics.text("SPAR_DUPLICATE_KEY", {
      said: `A keyed list has rows that share a key: ${this.keys.join(", ")}. Each row needs its own key.`,
    })
  }
}

type Entry<A> = Dom.Span & {
  readonly key: string
  readonly scope: Scope.Closeable | undefined
  readonly owner: Cell.Owner
  readonly cell: Cell.Cell<A>
}

type Target = {
  readonly parent: Dom.Host
  readonly before: Node | null
  readonly namespace: Dom.Namespace
}

type Later = Effect.Effect<void, never, Scope.Scope>

type Place = Target & {
  readonly owner: Cell.Owner
  readonly later: Cell.Waiting<Later>
  readonly claim: Dom.Cursor | undefined
  readonly start: (action: Action) => void
  readonly crashed: (defect: unknown) => void
  readonly view?: string | undefined
}

const isEventName = (name: string): boolean => /^on[A-Z]/.test(name)

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Predicate.isReadonlyObject(value) && !isReactive(value)

const insert = (node: Node, place: Place): void =>
  Dom.insert(place.parent, node, Dom.insertionPoint(place.claim, place.before))

const textNode = (place: Place): Text => {
  if (place.claim !== undefined) return Dom.claimText(place.claim, place.parent)

  const node = place.parent.ownerDocument.createTextNode("")

  insert(node, place)

  return node
}

const marker = (place: Place): Comment => {
  if (place.claim !== undefined) return Dom.claimComment(place.claim, place.parent, "")

  const node = place.parent.ownerDocument.createComment("")

  insert(node, place)

  return node
}

const bindLater = <A>(source: Reactive<A>, write: (value: A) => void, place: Place): Later =>
  Effect.flatMap(source.get, (initial) => {
    write(initial)

    return Effect.map(source[Observe](write, place.crashed), (stop) => Cell.own(place.owner, stop))
  })

const bind = <A>(source: Reactive<A>, write: (value: A) => void, place: Place): void => {
  const direct = source[Direct]
  if (direct === undefined) return Cell.defer(place.later, bindLater(source, write, place))

  const first = direct.read()

  write(first)
  Cell.own(place.owner, direct.watchFrom(first, write, place.crashed))
}

const apply = (value: unknown, write: (value: unknown) => void, place: Place): void => {
  if (isReactive(value)) return bind(value, write, place)

  write(value)
}

const applyEach = (
  entries: Readonly<Record<string, unknown>>,
  write: (name: string, value: unknown) => void,
  place: Place,
): void =>
  Object.entries(entries).forEach(([name, value]) =>
    apply(value, (current) => write(name, current), place),
  )

const attach = (node: Dom.Host, handle: Handle): Later =>
  Effect.acquireRelease(SubscriptionRef.set(handle[HandleTypeId], Option.some(node)), () =>
    SubscriptionRef.set(handle[HandleTypeId], Option.none()),
  )

const oncePerPress = new Set(["click", "submit"])

const held = (busy: Cell.Cell<boolean>, action: Action): Action => {
  if (!Effect.isEffect(action)) return action

  busy.write(true)

  return Effect.ensuring(
    action,
    Effect.sync(() => busy.write(false)),
  )
}

const listener = (place: Place, type: string, handler: unknown) => {
  const busy = Cell.make(false)
  const holds = oncePerPress.has(type)

  return (event: Event): void => {
    if (holds && busy.read()) return

    const action = traced(type, toAction(handler, event), event.currentTarget, place.view)

    place.start(holds ? held(busy, action) : action)
  }
}

const listen = (node: Dom.Host, type: string, handler: unknown, place: Place): void =>
  Cell.own(place.owner, Dom.listen(node, type, listener(place, type, handler)))

const childNamespace = (tag: string, namespace: Dom.Namespace): Dom.Namespace => {
  if (tag === "foreignObject") return "html"

  return namespace
}

const written = (node: Dom.Host, name: string, value: unknown, place: Place): void => {
  if (Dom.typingReplaced(node, name, value, causedAt())) {
    place.start(
      noticed(
        "SPAR_TYPING_REPLACED",
        Dom.described(node),
        `What was typed in ${Dom.described(node)} was replaced by a value from something that began before the last keystroke.`,
      ),
    )
  }

  Dom.setAttribute(node, name, value)
}

const applyProp = (node: Dom.Host, name: string, value: unknown, place: Place): void => {
  if (name === "children") return render(value, { ...place, parent: node, before: null })
  if (isEventName(name)) return listen(node, name.slice(2).toLowerCase(), value, place)
  if (isHandle(value)) return Cell.defer(place.later, attach(node, value))
  if (name === "class" && isRecord(value)) {
    return applyEach(value, (names, on) => Dom.toggleClass(node, names, on), place)
  }
  if (name === "style" && isRecord(value)) {
    return applyEach(value, (property, current) => Dom.setStyle(node, property, current), place)
  }

  return apply(value, (current) => written(node, name, current, place), place)
}

const renderText = (source: Reactive<unknown>, place: Place): void => {
  const node = textNode(place)

  bind(source, (value) => Dom.setText(node, value), place)
}

const within = (place: Place, namespace: Dom.Namespace): Place => {
  if (place.namespace === namespace) return place

  return { ...place, namespace }
}

const applyOwnProps = (node: Dom.Host, props: Intrinsic["props"], place: Place): void =>
  Object.keys(props)
    .filter((name) => name !== "children" && name !== "markup")
    .forEach((name) => applyProp(node, name, props[name], place))

const applyOwnPropsInTurn = (node: Dom.Host, props: Intrinsic["props"], place: Place): void => {
  if (Cell.isEmpty(place.later)) return applyOwnProps(node, props, place)

  Cell.defer(
    place.later,
    Effect.sync(() => applyOwnProps(node, props, place)),
  )
}

const fill = (node: Dom.Host, element: Intrinsic, inside: Place): void => {
  applyProp(node, "children", element.props["children"], inside)
  applyOwnPropsInTurn(node, element.props, { ...inside, view: element.view })
}

const fillMarkup = (node: Dom.Host, element: Intrinsic, place: Place, there: boolean): void => {
  const kept = Cell.make(there)

  apply(
    element.props["markup"],
    (current) => {
      if (!kept.read()) Dom.setMarkup(node, Markup.htmlOf(current))

      kept.write(false)
    },
    place,
  )
  applyOwnPropsInTurn(node, element.props, place)
}

const claimed = (element: Intrinsic, place: Place): Dom.Host | undefined =>
  place.claim === undefined ? undefined : Dom.claimElement(place.claim, element.tag)

const markedUp = (
  element: Intrinsic,
  inside: Place,
  place: Place,
  found: Dom.Host | undefined,
): Dom.Host => {
  if (found !== undefined) {
    fillMarkup(found, element, { ...inside, claim: undefined }, true)

    return found
  }

  const node = Dom.create(inside.parent.ownerDocument, element.tag, inside.namespace)

  fillMarkup(node, element, { ...inside, claim: undefined }, false)
  insert(node, place)

  return node
}

const renderIntrinsic = (element: Intrinsic, place: Place): Dom.Host => {
  const namespace = element.tag === "svg" ? "svg" : place.namespace
  const inside = within(place, childNamespace(element.tag, namespace))
  const found = claimed(element, place)
  if (element.props["markup"] !== undefined) return markedUp(element, inside, place, found)
  if (found !== undefined) {
    const children = Dom.cursorIn(found)

    fill(found, element, { ...inside, claim: children })
    Dom.dropRest(children, null)

    return found
  }

  const node = Dom.create(place.parent.ownerDocument, element.tag, namespace)

  fill(node, element, { ...inside, claim: undefined })
  insert(node, place)

  return node
}

const createBetweenMarkers = (element: Element, place: Place): Dom.Span => {
  if (place.claim !== undefined) {
    const start = marker(place)

    render(element, place)

    return { start, end: marker(place) }
  }

  const start = marker(place)
  const end = marker(place)

  render(element, { ...place, before: end })

  return { start, end }
}

const createSpan = (element: Element, place: Place): Dom.Span => {
  if (element[TypeId] !== "Intrinsic") return createBetweenMarkers(element, place)

  const node = renderIntrinsic(element, place)

  return { start: node, end: node }
}

const settle = (later: Cell.Waiting<Later>): Later =>
  Effect.suspend(() => {
    const waiting = Cell.take(later)
    if (waiting.length === 0) return Effect.void

    return Effect.andThen(
      Effect.forEach(waiting, Function.identity, { discard: true }),
      settle(later),
    )
  })

type Owned = { readonly scope: Scope.Closeable | undefined; readonly owner: Cell.Owner }

const scopesOf = (entries: ReadonlyArray<Owned>): ReadonlyArray<Scope.Closeable> =>
  entries.flatMap((entry) => (entry.scope === undefined ? [] : [entry.scope]))

const closeEntries = (entries: ReadonlyArray<Owned>): Effect.Effect<void> =>
  Effect.andThen(
    Effect.forEach(scopesOf(entries), (scope) => Scope.close(scope, Exit.void), { discard: true }),
    Effect.sync(() => entries.forEach((entry) => Cell.release(entry.owner))),
  )

const removeEntries = <A>(entries: ReadonlyArray<Entry<A>>): Effect.Effect<void> =>
  Effect.andThen(
    closeEntries(entries),
    Effect.sync(() => entries.forEach(Dom.removeSpan)),
  )

const removeAll = <A>(
  entries: ReadonlyArray<Entry<A>>,
  parent: Dom.Host,
  anchor: Node,
): Effect.Effect<void> => {
  const first = entries.at(0)
  const last = entries.at(-1)
  if (first === undefined || last === undefined) return Effect.void

  return Effect.andThen(
    closeEntries(entries),
    Effect.sync(() => Dom.removeRun(parent, first, last, anchor)),
  )
}

const mountEntry = <A>(
  rows: Mounted<A>,
  key: string,
  item: A,
  place: Place,
): Effect.Effect<Entry<A>> => {
  const scope = Scope.makeUnsafe()
  const owner = Cell.owner()
  const cell = Cell.make(item)
  const later = Cell.waiting<Later>()

  return rows.mount(key, fromCell(cell)).pipe(
    Effect.flatMap((element) => {
      const span = createSpan(element, { ...place, owner, later })
      const entry: Entry<A> = { start: span.start, end: span.end, key, scope, owner, cell }

      return Effect.as(settle(later), entry)
    }),
    Effect.onError(() => closeEntries([{ scope, owner }])),
    Scope.provide(scope),
  )
}

type Unsettled = { readonly scope: Scope.Closeable; readonly first: ReadonlyArray<Later> }

const scopeFor = (later: Cell.Waiting<Later>, unsettled: Cell.Waiting<Unsettled>) => {
  if (Cell.isEmpty(later)) return undefined

  const scope = Scope.makeUnsafe()

  Cell.defer(unsettled, { scope, first: Cell.take(later) })

  return scope
}

const drawEntry = <A>(
  rows: Drawn<A>,
  key: string,
  item: A,
  place: Place,
  unsettled: Cell.Waiting<Unsettled>,
): Entry<A> => {
  const owner = Cell.owner()
  const cell = Cell.make(item)
  const span = createSpan(rows.draw(key, fromCell(cell), item), { ...place, owner })

  return {
    start: span.start,
    end: span.end,
    key,
    scope: scopeFor(place.later, unsettled),
    owner,
    cell,
  }
}

const settleRow = (row: Unsettled, later: Cell.Waiting<Later>): Effect.Effect<void> =>
  Scope.provide(
    Effect.andThen(Effect.forEach(row.first, Function.identity, { discard: true }), settle(later)),
    row.scope,
  )

const repeated = (keys: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(keys.filter((key, index) => keys.indexOf(key) !== index)),
]

type Placed<A> = { readonly entry: Entry<A>; readonly position: number }

const wroteAt = <A>(entry: Entry<A> | undefined, item: A, key: (item: A) => string): boolean => {
  if (entry?.key !== key(item)) return false

  entry.cell.write(item)

  return true
}

const refreshedInPlace = <A>(
  previous: ReadonlyArray<Entry<A>>,
  shown: ReadonlyArray<A>,
  next: ReadonlyArray<A>,
  key: (item: A) => string,
): boolean => {
  if (previous.length !== next.length) return false

  const only = changedOne(shown, next)
  if (only !== undefined) {
    return next.slice(only, only + 1).every((item) => wroteAt(previous[only], item, key))
  }

  return next.every((item, index) => item === shown[index] || wroteAt(previous[index], item, key))
}

const onlyRemoved = <A>(
  previous: ReadonlyArray<Entry<A>>,
  kept: ReadonlyArray<Entry<A>>,
  nextKeys: ReadonlyArray<string>,
): boolean => {
  if (previous.length === 0 || kept.length !== nextKeys.length) return false

  return kept.every((entry, index) => entry.key === nextKeys[index])
}

const rewritten = <A>(entry: Entry<A>, item: A | undefined): void => {
  if (item !== undefined && !Object.is(entry.cell.read(), item)) entry.cell.write(item)
}

const refreshed = <A>(existing: Placed<A>, item: A): Placed<A> => {
  existing.entry.cell.write(item)

  return existing
}

const mountEach = <A>(
  rows: Mounted<A>,
  wanted: ReadonlyArray<readonly [string, A]>,
  positions: ReadonlyMap<string, Placed<A>>,
  keptCount: number,
  inside: Place,
  made: Cell.Waiting<Entry<A>>,
): Effect.Effect<ReadonlyArray<Placed<A>>> =>
  Effect.forEach(wanted, ([key, item], index) => {
    const existing = positions.get(key)
    if (existing !== undefined) return Effect.sync(() => refreshed(existing, item))

    return Effect.map(mountEntry(rows, key, item, inside), (entry) => {
      Cell.defer(made, entry)

      return { entry, position: keptCount + index }
    })
  })

const drawEach = <A>(
  rows: Drawn<A>,
  wanted: ReadonlyArray<readonly [string, A]>,
  positions: ReadonlyMap<string, Placed<A>>,
  keptCount: number,
  inside: Place,
  made: Cell.Waiting<Entry<A>>,
): Effect.Effect<ReadonlyArray<Placed<A>>> =>
  Effect.suspend(() => {
    const later = Cell.waiting<Later>()
    const unsettled = Cell.waiting<Unsettled>()
    const drawing: Place = { ...inside, later }
    const placed = wanted.map(([key, item], index): Placed<A> => {
      const existing = positions.get(key)
      if (existing !== undefined) return refreshed(existing, item)

      const entry = drawEntry(rows, key, item, drawing, unsettled)

      Cell.defer(made, entry)

      return { entry, position: keptCount + index }
    })

    return Effect.as(
      Effect.forEach(unsettled, (row) => settleRow(row, later), { discard: true }),
      placed,
    )
  })

const fillRows = Effect.fnUntraced(function* <A>(
  rows: Rows<A>,
  place: Place,
  anchor: Node,
  existing: Dom.Cursor | undefined,
) {
  const entries = yield* Ref.make<ReadonlyArray<Entry<A>>>([])
  const shown = Cell.make<ReadonlyArray<A>>([])
  const claiming = yield* Ref.make(existing)
  const placeEach = (
    wanted: ReadonlyArray<readonly [string, A]>,
    positions: ReadonlyMap<string, Placed<A>>,
    keptCount: number,
  ) =>
    Effect.flatMap(Ref.getAndSet(claiming, undefined), (claim) => {
      const inside: Place = { ...place, before: anchor, claim }
      const made = Cell.waiting<Entry<A>>()
      const placed = (
        rows.kind === "drawn"
          ? drawEach(rows, wanted, positions, keptCount, inside, made)
          : mountEach(rows, wanted, positions, keptCount, inside, made)
      ).pipe(Effect.onError(() => Effect.suspend(() => removeEntries(Cell.take(made)))))

      return claim === undefined
        ? placed
        : Effect.tap(placed, () => Effect.sync(() => Dom.dropRest(claim, anchor)))
    })

  const reconcile = Effect.fnUntraced(
    function* (next: ReadonlyArray<A>) {
      const previous = yield* Ref.get(entries)

      if (refreshedInPlace(previous, shown.read(), next, rows.key)) return shown.write(next)

      shown.write([])

      const nextKeys = next.map(rows.key)
      const keys = new Set(nextKeys)

      if (keys.size !== next.length) {
        return yield* Effect.die(new DuplicateKey({ keys: repeated(nextKeys) }))
      }

      const kept = previous.filter((entry) => keys.has(entry.key))

      yield* kept.length === 0
        ? removeAll(previous, place.parent, anchor)
        : removeEntries(previous.filter((entry) => !keys.has(entry.key)))

      if (onlyRemoved(previous, kept, nextKeys)) {
        kept.forEach((entry, index) => rewritten(entry, next[index]))
        yield* Ref.set(entries, kept)

        return shown.write(next)
      }

      const positions = new Map(kept.map((entry, position) => [entry.key, { entry, position }]))

      const placed = yield* placeEach(Arr.zip(nextKeys, next), positions, kept.length)
      const current = placed.map((each) => each.entry)
      const staying = settled(placed.map((each) => each.position))

      yield* Effect.sync(() => Dom.placeSpans(place.parent, current, staying, anchor))
      yield* Ref.set(entries, current)
      shown.write(next)
    },
    Effect.provideService(Scheduler.PreventSchedulerYield, true),
  )

  yield* Effect.addFinalizer(() => Effect.flatMap(Ref.get(entries), closeEntries))

  const turn = yield* Semaphore.make(1)
  const scope = yield* Effect.scope
  const update = yield* starterIn(scope)

  yield* Effect.acquireRelease(
    rows.items[Observe](
      (next) => update(Semaphore.withPermit(turn, reconcile(next))),
      place.crashed,
    ),
    (stop) => Effect.sync(stop),
  )

  const initial = yield* rows.items.get

  yield* Semaphore.withPermit(turn, reconcile(initial))
})

const renderRows = <A>(rows: Rows<A>, place: Place): void => {
  if (place.claim !== undefined) {
    const list = Dom.claimList(place.claim, place.parent)

    return Cell.defer(place.later, fillRows(rows, place, list.anchor, list.rows))
  }

  const anchor = place.parent.ownerDocument.createComment("")

  insert(anchor, place)
  Cell.defer(place.later, fillRows(rows, place, anchor, undefined))
}

const renderElement = (element: Element, place: Place): void => {
  if (element[TypeId] === "Fragment") return render(element.children, place)
  if (element[TypeId] === "Keyed") return element.open((rows) => renderRows(rows, place))
  if (element[TypeId] === "Portal") {
    return render(element.child, {
      ...place,
      parent: element.layer,
      before: null,
      namespace: "html",
      claim: undefined,
    })
  }

  renderIntrinsic(element, place)
}

const render = (child: unknown, place: Place): void => {
  if (Predicate.isString(child) || Predicate.isNumber(child)) {
    return Dom.setText(textNode(place), child)
  }
  if (isReactive(child)) return renderText(child, place)
  if (Array.isArray(child)) return child.forEach((item) => render(item, place))
  if (isElement(child)) return renderElement(child, place)
}

export const renderInto = Effect.fnUntraced(function* (
  child: unknown,
  target: Target,
  claim: Dom.Cursor | undefined,
) {
  const start = yield* starter()
  const owner = Cell.owner()
  const later = Cell.waiting<Later>()

  Dom.watchTyping(target.parent.ownerDocument)

  yield* Effect.addFinalizer(() => Effect.sync(() => Cell.release(owner)))
  yield* Effect.sync(() =>
    render(child, {
      ...target,
      owner,
      later,
      claim,
      start,
      crashed: (defect) => start(report(defect)),
    }),
  )
  yield* settle(later)
})
