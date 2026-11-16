import { Effect, Predicate, Scope, SubscriptionRef } from "effect"
import { keyed } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { fromSubscriptionRef, map } from "./internal/reactive.ts"
import { ViewScope } from "./internal/viewScope.ts"

const TypeId = "~spar/Component"

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

const isComponent = <Props, E, R, ViewProps>(
  mountable: Mountable<Props, E, R, ViewProps>,
): mountable is Component<Props, E, R, ViewProps> => Predicate.hasProperty(mountable, TypeId)

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

export const connect =
  <Props, Outer, E, Requirements>(props: (outer: Outer) => Effect.Effect<Props, E, Requirements>) =>
  (view: View<Props>): Component<Outer, E, Outside<Requirements>, Props> =>
    make(view, (outer) =>
      Effect.withSpan(inViewScope(Effect.map(props(outer), view)), spanName(view)),
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

export const pending =
  <Props>(placeholder: View<Props>) =>
  <R = never, ViewProps = never>(
    self: Mountable<Props, never, R, ViewProps>,
  ): Component<Props, never, R, ViewProps> =>
    make(
      viewOf(self),
      Effect.fnUntraced(function* (props: Props) {
        const current = yield* SubscriptionRef.make<{
          readonly key: string
          readonly element: Element
        }>({
          key: "pending",
          element: placeholder(props),
        })

        yield* Effect.forkScoped(
          child(self, props).pipe(
            Effect.flatMap((element) => SubscriptionRef.set(current, { key: "ready", element })),
          ),
        )

        return keyed(
          map(fromSubscriptionRef(current), ({ key, element }) => [
            { key, mount: Effect.succeed(element), refresh: Effect.void },
          ]),
        )
      }),
    )
