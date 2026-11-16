import { Effect, Function, Option, Stream, SubscriptionRef } from "effect"
import * as Handle from "./Handle.ts"
import type { Action } from "./internal/action.ts"
import * as Dom from "./internal/dom.ts"
import { Frame, OverlayLayer } from "./internal/frame.ts"
import { HandleTypeId } from "./internal/handle.ts"
import { events, listen } from "./internal/listen.ts"
import type { Source } from "./internal/listen.ts"
import { fromStream, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { ViewScope } from "./internal/viewScope.ts"

export type { OverlayLayer } from "./internal/frame.ts"

const isEscape = (event: Event): boolean => event instanceof KeyboardEvent && event.key === "Escape"

const onEscape = (overlays: HTMLElement, layer: HTMLElement, onDismiss: Action) =>
  listen(document, "keydown", (event: Event): Action => {
    if (!isEscape(event)) return []
    if (!Dom.isTopLayer(overlays, layer)) return []

    return onDismiss
  })

export const modal = Effect.fnUntraced(function* (options: {
  readonly onDismiss: Action
  readonly initialFocus?: Handle.Handle
}) {
  yield* ViewScope

  const frame = yield* Frame
  const layer = yield* OverlayLayer

  yield* Effect.acquireRelease(
    Effect.sync(() => Dom.openModal(frame, layer.element)),
    (restore) => Effect.sync(restore),
  )
  yield* onEscape(frame.overlays, layer.element, options.onDismiss)
  yield* listen(document, "keydown", (event: Event): Action => {
    Dom.keepTabInside(layer.element, event)

    return []
  })
  yield* Effect.forkScoped(
    Option.match(Option.fromNullishOr(options.initialFocus), {
      onNone: () => Effect.sync(() => Dom.focus(layer.element)),
      onSome: Handle.focus,
    }),
  )
})

const anchorNodes = (anchor: Handle.Handle | undefined): ReadonlyArray<Node> =>
  Option.toArray(Option.fromNullishOr(anchor)).flatMap((handle) =>
    Option.toArray(SubscriptionRef.getUnsafe(handle[HandleTypeId])),
  )

export const dismissable = Effect.fnUntraced(function* (options: {
  readonly onDismiss: Action
  readonly anchor?: Handle.Handle
}) {
  yield* ViewScope

  const frame = yield* Frame
  const layer = yield* OverlayLayer

  yield* onEscape(frame.overlays, layer.element, options.onDismiss)
  yield* listen(document, "pointerdown", (event: Event): Action => {
    const inside = [layer.element, ...anchorNodes(options.anchor)]
    if (inside.some((node) => Dom.holds(node, event.target))) return []

    return options.onDismiss
  })
})

export type Placement = {
  readonly position: "fixed"
  readonly left: Reactive<string | null>
  readonly right: Reactive<string | null>
  readonly top: Reactive<string | null>
  readonly bottom: Reactive<string | null>
  readonly minWidth: Reactive<string>
  readonly maxWidth: string
  readonly maxHeight: Reactive<string>
}

const corner: Dom.Box = { x: 0, y: 0, width: 0, height: 0 }

const viewportMoves: Source<Event> = {
  add: (listener) => {
    window.addEventListener("resize", listener)
    window.addEventListener("scroll", listener, true)
  },
  remove: (listener) => {
    window.removeEventListener("resize", listener)
    window.removeEventListener("scroll", listener, true)
  },
}

const margin = 8

const spaceBelow = (box: Dom.Box): number => window.innerHeight - (box.y + box.height)

const fitsBelow = (box: Dom.Box): boolean => spaceBelow(box) >= box.y

const room = (box: Dom.Box): number => (fitsBelow(box) ? spaceBelow(box) : box.y)

const spaceRight = (box: Dom.Box): number => window.innerWidth - (box.x + box.width)

const startsLeft = (box: Dom.Box): boolean => box.x <= spaceRight(box)

export const position = Effect.fnUntraced(function* (anchor: Handle.Handle) {
  const measured = Effect.map(
    Handle.measure(anchor),
    Option.getOrElse(() => corner),
  )
  const first = yield* measured
  const box = yield* fromStream(
    first,
    Stream.mapEffect(events(viewportMoves, Function.constVoid), () => measured),
  )
  const placement: Placement = {
    position: "fixed",
    left: map(box, (now) => (startsLeft(now) ? `${Math.max(now.x, margin)}px` : null)),
    right: map(box, (now) => (startsLeft(now) ? null : `${Math.max(spaceRight(now), margin)}px`)),
    top: map(box, (now) => (fitsBelow(now) ? `${now.y + now.height}px` : null)),
    bottom: map(box, (now) => (fitsBelow(now) ? null : `${window.innerHeight - now.y}px`)),
    minWidth: map(box, (now) => `${now.width}px`),
    maxWidth: `calc(100vw - ${margin * 2}px)`,
    maxHeight: map(box, (now) => `${Math.max(room(now) - margin, 0)}px`),
  }

  return placement
})
