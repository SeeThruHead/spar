import { Effect, Predicate, Scope, SubscriptionRef } from "effect"
import { TypeId, isComponent } from "./internal/component.ts"
import { report } from "./internal/crash.ts"
import * as Dom from "./internal/dom.ts"
import { keyed, portal as portalTo } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { Frame, OverlayLayer } from "./internal/frame.ts"
import { fromSubscriptionRef, map } from "./internal/reactive.ts"
import { ViewScope } from "./internal/viewScope.ts"

export type View<Props> = (props: Props) => Element

export type Component<Props, E = never, R = never, ViewProps = never> = {
  readonly [TypeId]: typeof TypeId
  readonly view: View<ViewProps>
  readonly mount: (props: Props) => Effect.Effect<Element, E, R | Scope.Scope>
}

export type Mountable<Props, E = never, R = never, ViewProps = never> =
  | (View<Props> & View<ViewProps>)
  | Component<Props, E, R, ViewProps>

const make = <Props, E, R, ViewProps>(
  view: View<ViewProps>,
  mount: (props: Props) => Effect.Effect<Element, E, R | Scope.Scope>,
): Component<Props, E, R, ViewProps> => ({ [TypeId]: TypeId, view, mount })

const viewOf = <Props, E, R, ViewProps>(
  mountable: Mountable<Props, E, R, ViewProps>,
): View<ViewProps> => (isComponent(mountable) ? mountable.view : mountable)

export const child = <Props, E = never, R = never, ViewProps = never>(
  mountable: Mountable<Props, E, R, ViewProps>,
  props: Props,
): Effect.Effect<Element, E, R | Scope.Scope> => {
  if (isComponent(mountable)) return mountable.mount(props)

  return Effect.sync(() => mountable(props))
}

type Outside<Requirements> = Exclude<Exclude<Requirements, ViewScope>, Scope.Scope>

const inViewScope = <A, E, Requirements>(
  effect: Effect.Effect<A, E, Requirements>,
): Effect.Effect<A, E, Outside<Requirements> | Scope.Scope> =>
  Effect.flatMap(Effect.scope, (scope) =>
    effect.pipe(
      Effect.provideService(ViewScope, { mounted: true }),
      Effect.provideService(Scope.Scope, scope),
    ),
  )

const spanName = (view: { readonly name: string }): string =>
  view.name === "" ? "View (unnamed)" : view.name

type Extra<Props, ViewProps> = [Props] extends [never]
  ? never
  : Exclude<keyof Props, keyof ViewProps>

type OnlyWhatTheViewTakes<Props, ViewProps> = [Extra<Props, ViewProps>] extends [never]
  ? unknown
  : { readonly "props the view does not take": Extra<Props, ViewProps> }

export const connect =
  <Props, Outer, E, Requirements>(props: (outer: Outer) => Effect.Effect<Props, E, Requirements>) =>
  <ViewProps = Props>(
    view: View<ViewProps> & View<Props> & OnlyWhatTheViewTakes<Props, ViewProps>,
  ): Component<Outer, E, Outside<Requirements>, ViewProps> =>
    make<Outer, E, Outside<Requirements>, ViewProps>(view, (outer) =>
      Effect.withSpan(inViewScope(Effect.map(props(outer), view)), spanName(view), {
        captureStackTrace: false,
      }),
    )

export const mapProps =
  <Outer, Props>(f: (outer: Outer) => Props) =>
  <E = never, R = never, ViewProps = never>(
    self: Mountable<Props, E, R, ViewProps>,
  ): Component<Outer, E, R, ViewProps> =>
    make(viewOf(self), (outer) => child(self, f(outer)))

export const branch =
  <Props, E2 = never, R2 = never>(
    test: (props: Props) => boolean,
    other: Mountable<Props, E2, R2>,
  ) =>
  <E = never, R = never, ViewProps = never>(
    self: Mountable<Props, E, R, ViewProps>,
  ): Component<Props, E | E2, R | R2, ViewProps> =>
    make<Props, E | E2, R | R2, ViewProps>(viewOf(self), (props) =>
      test(props) ? child(other, props) : child(self, props),
    )

export const crash =
  <R2 = never>(fallback: Mountable<{ readonly defect: unknown }, never, R2>) =>
  <Props, E = never, R = never, ViewProps = never>(
    self: Mountable<Props, E, R, ViewProps>,
  ): Component<Props, E, R | R2, ViewProps> =>
    make<Props, E, R | R2, ViewProps>(viewOf(self), (props) =>
      Effect.catchDefect(child(self, props), (defect) =>
        Effect.andThen(report(defect), child(fallback, { defect })),
      ),
    )

export const recover =
  <const Tag extends string, Err extends { readonly _tag: Tag }, R2 = never>(
    tag: Tag,
    handler: Mountable<{ readonly error: Err }, never, R2>,
  ) =>
  <Props, E = never, R = never, ViewProps = never>(self: Mountable<Props, E | Err, R, ViewProps>) =>
    make(viewOf(self), (props: Props) =>
      child(self, props).pipe(
        Effect.catchIf(
          (error: E | Err): error is Err => Predicate.isTagged(error, tag),
          (error) => child(handler, { error }),
        ),
      ),
    )

type Shown = { readonly key: string; readonly element: Element }

export const pending =
  <Props>(placeholder: View<Props>) =>
  <R = never, ViewProps = never>(
    self: Mountable<Props, never, R, ViewProps>,
  ): Component<Props, never, R, ViewProps> =>
    make(
      viewOf(self),
      Effect.fnUntraced(function* (props: Props) {
        const current = yield* SubscriptionRef.make<Shown>({
          key: "pending",
          element: placeholder(props),
        })

        yield* Effect.forkScoped(
          child(self, props).pipe(
            Effect.flatMap((element) => SubscriptionRef.set(current, { key: "ready", element })),
            Effect.tapDefect(report),
          ),
        )

        return keyed({
          kind: "mounted",
          items: map(fromSubscriptionRef(current), (shown) => [shown]),
          key: (shown: Shown) => shown.key,
          mount: (_key, shown) => Effect.map(shown.get, (now) => now.element),
        })
      }),
    )

export const portal = <Props, E = never, R = never, ViewProps = never>(
  self: Mountable<Props, E, R, ViewProps>,
): Component<Props, E, Exclude<R, OverlayLayer> | Frame, ViewProps> =>
  make(
    viewOf(self),
    Effect.fnUntraced(function* (props: Props) {
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
