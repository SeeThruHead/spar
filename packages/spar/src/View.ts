import { Effect, Schema, Scope } from "effect"
import * as Cell from "./internal/cell.ts"
import type { TypeId } from "./internal/component.ts"
import { report } from "./internal/crash.ts"
import * as Dom from "./internal/dom.ts"
import { fragment, keyed, portal as portalTo } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { Frame, OverlayLayer } from "./internal/frame.ts"
import { fromCell, map } from "./internal/reactive.ts"
import { Hydrating, OnServer } from "./internal/server.ts"
import { drawn, recovering } from "./internal/inspect.ts"
import type { Fields } from "./Props.ts"
import * as Diagnostics from "./internal/said.ts"
import { SlowAfter, child, component, viewOf } from "./internal/viewParts.ts"

export type View<Props> = (props: Props) => Element

export type Component<Props, E = never, R = never, ViewProps = never> = {
  readonly [TypeId]: typeof TypeId
  readonly "~requirements"?: (requirements: R) => R
  readonly view: View<ViewProps> & Declared
  readonly mount: (props: Props) => Effect.Effect<Element, E, R | Scope.Scope>
} & ([E] extends [never] ? (props: Props) => Element : unknown)

export type Declared = {
  readonly displayName: string
  readonly props: Fields
  readonly at: string
}

export type Mountable<Props, E = never, R = never, ViewProps = never> =
  | (View<Props> & View<ViewProps> & Declared)
  | Component<Props, E, R, ViewProps>

export { child, SlowAfter }

export type Made<F extends Fields> = View<Schema.Struct<F>["Type"]> & {
  readonly displayName: string
  readonly props: F
  readonly at: string
}

export const make = <const F extends Fields>(
  name: string,
  props: F,
  draw: (props: Schema.Struct<F>["Type"]) => Element,
): Made<F> =>
  Object.assign((given: Schema.Struct<F>["Type"]) => drawn(name, props, given, draw(given)), {
    displayName: name,
    props,
    at: Diagnostics.locationIn(new Error("where this view was made").stack, 1),
  })

export const mapProps =
  <Outer, Props>(f: (outer: Outer) => Props) =>
  <E = never, R = never, ViewProps = never>(
    self: Mountable<Props, E, R, ViewProps>,
  ): Component<Outer, E, R, ViewProps> =>
    component(viewOf(self), (outer) => child(self, f(outer)))

export const branch =
  <Props, E2 = never, R2 = never>(
    test: (props: Props) => boolean,
    other: Mountable<Props, E2, R2>,
  ) =>
  <E = never, R = never, ViewProps = never>(
    self: Mountable<Props, E, R, ViewProps>,
  ): Component<Props, E | E2, R | R2, ViewProps> =>
    component<Props, E | E2, R | R2, ViewProps>(viewOf(self), (props) =>
      test(props) ? child(other, props) : child(self, props),
    )

export const crash =
  <R2 = never>(fallback: Mountable<{ readonly defect: unknown }, never, R2>) =>
  <Props, E = never, R = never, ViewProps = never>(
    self: Mountable<Props, E, R, ViewProps>,
  ): Component<Props, E, R | R2, ViewProps> =>
    component<Props, E, R | R2, ViewProps>(viewOf(self), (props) =>
      Effect.catchDefect(child(self, props), (defect) =>
        Effect.andThen(report(defect, viewOf(self)), child(fallback, { defect })),
      ),
    )

export const recover =
  <Err, R2 = never>(
    failure: Schema.Codec<Err, unknown>,
    handler: Mountable<{ readonly error: Err }, never, R2>,
  ) =>
  <Props, E = never, R = never, ViewProps = never>(self: Mountable<Props, E | Err, R, ViewProps>) =>
    component(viewOf(self), (props: Props) =>
      child(self, props).pipe(
        Effect.tap(() =>
          Effect.sync(() =>
            recovering(String(Reflect.get(failure, "name")), viewOf(handler).displayName),
          ),
        ),
        Effect.catchIf(
          (error: E | Err): error is Err => Schema.is(failure)(error),
          (error) => child(handler, { error }),
        ),
      ),
    )

type Shown = { readonly key: string; readonly element: Element }

const waitsForContent = Effect.gen(function* () {
  const onServer = yield* OnServer
  const hydrating = yield* Hydrating

  return onServer || hydrating.read()
})

export const pending =
  <Props>(placeholder: View<Props>) =>
  <R = never, ViewProps = never>(
    self: Mountable<Props, never, R, ViewProps>,
  ): Component<Props, never, R, ViewProps> =>
    component(
      viewOf(self),
      Effect.fnUntraced(function* (props: Props) {
        const settled = yield* waitsForContent
        if (settled) return yield* child(self, props)

        const current = Cell.make<Shown>({ key: "pending", element: placeholder(props) })

        yield* Effect.forkScoped(
          child(self, props).pipe(
            Effect.flatMap((element) =>
              Effect.sync(() => current.write({ key: "ready", element })),
            ),
            Effect.tapDefect(report),
          ),
        )

        return keyed({
          kind: "mounted",
          items: map(fromCell(current), (shown) => [shown]),
          key: (shown: Shown) => shown.key,
          mount: (_key, shown) => Effect.map(shown.get, (now) => now.element),
        })
      }),
    )

export const split = <Props, R = never, LoadedProps = never>(
  placeholder: View<Props> & Declared,
  load: () => Promise<Mountable<Props, never, R, LoadedProps>>,
): Component<Props, never, R, Props> =>
  pending(placeholder)(
    component(placeholder, (props: Props) =>
      Effect.flatMap(
        Effect.promise(() => load()),
        (loaded) => child(loaded, props),
      ),
    ),
  )

export const portal = <Props, E = never, R = never, ViewProps = never>(
  self: Mountable<Props, E, R, ViewProps>,
): Component<Props, E, Exclude<R, OverlayLayer> | Frame, ViewProps> =>
  component(
    viewOf(self),
    Effect.fnUntraced(function* (props: Props) {
      const onServer = yield* OnServer
      if (onServer) return fragment([])

      const frame = yield* Frame
      const layer = yield* Effect.acquireRelease(
        Effect.sync(() => Dom.addLayer(frame.overlays)),
        (element) => Effect.sync(() => element.remove()),
      )
      const content = yield* Effect.provideService(child(self, props), OverlayLayer, {
        element: layer,
      })

      return portalTo(layer, content)
    }),
  )
