import { Context, Duration, Effect, Layer, Option, Schema, Scope, SubscriptionRef } from "effect"
import { TypeId, isComponent } from "./internal/component.ts"
import { report } from "./internal/crash.ts"
import * as Dom from "./internal/dom.ts"
import { fragment, keyed, portal as portalTo } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { Frame, OverlayLayer } from "./internal/frame.ts"
import { fromSubscriptionRef, map } from "./internal/reactive.ts"
import { Hydrating, OnServer } from "./internal/server.ts"
import { RowKey, UiTree } from "./internal/uiTree.ts"
import { drawn, placed, recovering } from "./internal/inspect.ts"
import { ViewScope, pathOf } from "./internal/viewScope.ts"
import type { Fields } from "./Props.ts"
import * as Diagnostics from "./Diagnostics.ts"
import * as Timeline from "./Timeline.ts"

export type View<Props> = (props: Props) => Element

export type Component<Props, E = never, R = never, ViewProps = never> = {
  readonly [TypeId]: typeof TypeId
  readonly view: View<ViewProps> & Declared
  readonly mount: (props: Props) => Effect.Effect<Element, E, R | Scope.Scope>
}

export type Declared = {
  readonly displayName: string
  readonly props: Fields
  readonly at: string
}

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
  at: string,
): Effect.Effect<A, E, Outside<Requirements> | Scope.Scope> =>
  Effect.flatMap(Effect.context<Scope.Scope>(), (context) => {
    const scope = Context.get(context, Scope.Scope)

    return effect.pipe(
      Effect.provideService(ViewScope, {
        parent: Context.getOrUndefined(context, ViewScope),
        label: labelled(name, Context.get(context, RowKey)),
        at,
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
) => connected<Props, unknown, E, Requirements>(props, [])

export const taking = <const F extends Fields, Props, E, Requirements>(
  _outer: F,
  props: (outer: Schema.Struct<F>["Type"]) => Effect.Effect<Props, E, Requirements>,
) => connected(props, [])

const shownIn = <Props>(view: View<Props>, made: Props, services: ReadonlyArray<string>) =>
  ViewScope.use((mounted) =>
    Effect.sync(() => {
      const element = view(made)

      placed(() => pathOf(mounted), services)

      return element
    }),
  )

const aFrame = 16

const noticed = <A, E, R>(
  view: Declared,
  made: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | ViewScope> =>
  Effect.flatMap(
    Effect.zip(Effect.timed(made), Effect.service(ViewScope)),
    ([[took, value], mounted]) => {
      const millis = Math.round(Duration.toMillis(took))
      if (millis < aFrame) return Effect.succeed(value)

      return Effect.as(
        Effect.andThen(
          Effect.annotateCurrentSpan("spar.waited_ms", millis),
          Timeline.note("waited", spanName(view), () => ({
            millis,
            code: "SPAR_COMPONENT_WAITED",
            in: pathOf(mounted).join(" > "),
            at: view.at,
          })),
        ),
        value,
      )
    },
  )

const connected =
  <Props, Outer, E, Requirements>(
    props: (outer: Outer) => Effect.Effect<Props, E, Requirements>,
    services: ReadonlyArray<string>,
  ) =>
  <ViewProps = Props>(
    view: View<ViewProps> & View<Props> & Declared & OnlyWhatTheViewTakes<Props, ViewProps>,
  ): Component<Outer, E, Outside<Requirements>, ViewProps> =>
    component<Outer, E, Outside<Requirements>, ViewProps>(view, (outer) =>
      Effect.withSpan(
        inViewScope(
          Effect.flatMap(noticed(view, props(outer)), (made) => shownIn(view, made, services)),
          spanName(view),
          view.at,
        ),
        spanName(view),
        { captureStackTrace: false, attributes: { "spar.kind": "view" } },
      ),
    )

export const described = (services: ReadonlyArray<string>) => ({
  connect: <Props, E, Requirements>(props: () => Effect.Effect<Props, E, Requirements>) =>
    connected<Props, unknown, E, Requirements>(props, services),
  taking: <const F extends Fields, Props, E, Requirements>(
    _outer: F,
    props: (outer: Schema.Struct<F>["Type"]) => Effect.Effect<Props, E, Requirements>,
  ) => connected(props, services),
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

const placeOf = (parent: ReadonlyArray<string>, taken: string, mark: string): string =>
  [...parent, taken.replace(` ${mark}`, "")].join(" / ")

export const within =
  <Provided, EL, RL>(layerAt: (place: string) => Layer.Layer<Provided, EL, RL>, mark: string) =>
  <Props, E = never, R = never, ViewProps = never>(
    self: Mountable<Props, E, R, ViewProps>,
  ): Component<Props, E | EL, Exclude<R, Provided | Scope.Scope> | RL, ViewProps> =>
    component(viewOf(self), (props) =>
      Effect.flatMap(Effect.context<Scope.Scope>(), (context) => {
        const scope = Context.get(context, Scope.Scope)
        const tree = Context.get(context, UiTree)
        const parent = Option.match(Context.getOption(context, ViewScope), {
          onNone: () => [],
          onSome: pathOf,
        })
        const label = labelled(viewOf(self).displayName, Context.get(context, RowKey))
        const { place } = tree.enter({}, () => [...parent, `${label} ${mark}`])

        return Scope.addFinalizer(
          scope,
          Effect.sync(() => tree.leave(place)),
        ).pipe(
          Effect.andThen(
            Layer.buildWithScope(
              layerAt(placeOf(parent, place.path.slice(parent.length).join(""), mark)),
              scope,
            ),
          ),
          Effect.flatMap((built) =>
            Effect.provide(child(self, props), Context.add(built, Scope.Scope, scope)),
          ),
        )
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
