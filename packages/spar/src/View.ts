import { Context, Effect, Schema, Scope, SubscriptionRef } from "effect"
import { TypeId, isComponent } from "./internal/component.ts"
import { report } from "./internal/crash.ts"
import * as Dom from "./internal/dom.ts"
import { fragment, keyed, portal as portalTo } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { Frame, OverlayLayer } from "./internal/frame.ts"
import { fromSubscriptionRef, map } from "./internal/reactive.ts"
import { Hydrating, OnServer } from "./internal/server.ts"
import { RowKey, UiTree } from "./internal/uiTree.ts"
import { ViewScope } from "./internal/viewScope.ts"
import type { Fields } from "./Props.ts"

export type View<Props> = (props: Props) => Element

export type Component<Props, E = never, R = never, ViewProps = never> = {
  readonly [TypeId]: typeof TypeId
  readonly view: View<ViewProps> & Declared
  readonly mount: (props: Props) => Effect.Effect<Element, E, R | Scope.Scope>
}

export type Declared = { readonly displayName: string; readonly props: Fields }

export type Mountable<Props, E = never, R = never, ViewProps = never> =
  | (View<Props> & View<ViewProps> & Declared)
  | Component<Props, E, R, ViewProps>

const component = <Props, E, R, ViewProps>(
  view: View<ViewProps> & Declared,
  mount: (props: Props) => Effect.Effect<Element, E, R | Scope.Scope>,
): Component<Props, E, R, ViewProps> => ({ [TypeId]: TypeId, view, mount })

const viewOf = <Props, E, R, ViewProps>(
  mountable: Mountable<Props, E, R, ViewProps>,
): View<ViewProps> & Declared => (isComponent(mountable) ? mountable.view : mountable)

export const child = <Props, E = never, R = never, ViewProps = never>(
  mountable: Mountable<Props, E, R, ViewProps>,
  props: Props,
): Effect.Effect<Element, E, R | Scope.Scope> => {
  if (isComponent(mountable)) return mountable.mount(props)

  return Effect.sync(() => mountable(props))
}

type Outside<Requirements> = Exclude<Exclude<Requirements, ViewScope>, Scope.Scope>

const labelled = (name: string, key: string | undefined): string =>
  key === undefined ? name : `${name}[${key}]`

const inViewScope = <A, E, Requirements>(
  effect: Effect.Effect<A, E, Requirements>,
  name: string,
): Effect.Effect<A, E, Outside<Requirements> | Scope.Scope> =>
  Effect.flatMap(Effect.context<Scope.Scope>(), (context) => {
    const scope = Context.get(context, Scope.Scope)

    return effect.pipe(
      Effect.provideService(ViewScope, {
        parent: Context.getOrUndefined(context, ViewScope),
        label: labelled(name, Context.get(context, RowKey)),
        scope,
        tree: Context.get(context, UiTree),
      }),
      Effect.provideService(RowKey, undefined),
      Effect.provideService(Scope.Scope, scope),
    )
  })

export type Made<F extends Fields> = View<Schema.Struct<F>["Type"]> & {
  readonly displayName: string
  readonly props: F
}

export const make = <const F extends Fields>(
  name: string,
  props: F,
  draw: (props: Schema.Struct<F>["Type"]) => Element,
): Made<F> =>
  Object.assign((given: Schema.Struct<F>["Type"]) => draw(given), { displayName: name, props })

const spanName = (view: Declared): string =>
  view.displayName === "" ? "View (unnamed)" : view.displayName

type Extra<Props, ViewProps> = [Props] extends [never]
  ? never
  : Exclude<keyof Props, keyof ViewProps>

type OnlyWhatTheViewTakes<Props, ViewProps> = [Extra<Props, ViewProps>] extends [never]
  ? unknown
  : { readonly "props the view does not take": Extra<Props, ViewProps> }

export const connect = <Props, E, Requirements>(
  props: () => Effect.Effect<Props, E, Requirements>,
) => connected<Props, unknown, E, Requirements>(props)

export const taking = <const F extends Fields, Props, E, Requirements>(
  _outer: F,
  props: (outer: Schema.Struct<F>["Type"]) => Effect.Effect<Props, E, Requirements>,
) => connected(props)

const connected =
  <Props, Outer, E, Requirements>(props: (outer: Outer) => Effect.Effect<Props, E, Requirements>) =>
  <ViewProps = Props>(
    view: View<ViewProps> & View<Props> & Declared & OnlyWhatTheViewTakes<Props, ViewProps>,
  ): Component<Outer, E, Outside<Requirements>, ViewProps> =>
    component<Outer, E, Outside<Requirements>, ViewProps>(view, (outer) =>
      Effect.withSpan(inViewScope(Effect.map(props(outer), view), spanName(view)), spanName(view), {
        captureStackTrace: false,
      }),
    )

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
        Effect.andThen(report(defect), child(fallback, { defect })),
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
