import { Context, Effect, Predicate, Record } from "effect"
import type { Schema } from "effect"
import type { Scope } from "effect"
import type { Action } from "./internal/action.ts"
import { RowKey } from "./internal/uiTree.ts"
import { drawingIn, drawingNow, drawnHere } from "./internal/drawing.ts"
import { keyed } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { drawn, placed } from "./internal/inspect.ts"
import { isReactive, map, succeed } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { ViewScope, pathOf } from "./internal/viewScope.ts"
import * as Diagnostics from "./Diagnostics.ts"
import * as Events from "./Events.ts"
import type { Fields } from "./Props.ts"
import type * as Query from "./Query.ts"
import * as UiState from "./UiState.ts"
import { component, inViewScope } from "./View.ts"
import type { Component } from "./View.ts"

export type Enhancer<In, Add, E = never, R = never> = ((props: In) => Effect.Effect<Add, E, R>) & {
  readonly fields?: Fields
  readonly services?: ReadonlyArray<string>
}

type Outside<R> = Exclude<R, Scope.Scope | ViewScope>

type Composed<Outer, Inner, Add, E, R> = {
  (view: (props: Inner) => Element, name?: string): Component<Outer, E, Outside<R>, Outer>
  (props: Outer): Effect.Effect<Add, E, R>
}

type Props = Readonly<Record<string, unknown>>

type Anything = object | string | number | boolean | bigint | symbol | null | undefined

type Step = Enhancer<Props, Props, Anything, Scope.Scope | ViewScope>

const merged = (props: Props, step: Step) =>
  Effect.map(step(props), (added) => ({ ...props, ...added }))

const isProps = (given: unknown): given is Props => Predicate.isReadonlyObject(given)

const applied = (steps: ReadonlyArray<Step>, outer: Props) =>
  Effect.reduce(steps, () => outer, merged)

const fieldsOf = (steps: ReadonlyArray<Step>): Fields =>
  Object.assign({}, ...steps.map((step) => step.fields ?? {}))

const servicesOf = (steps: ReadonlyArray<Step>): ReadonlyArray<string> =>
  steps.flatMap((step) => step.services ?? [])

export const uses = (services: ReadonlyArray<string>): Enhancer<unknown, unknown> =>
  Object.assign(() => Effect.succeed({}), { services })

const isNamedView = (view: (props: Props) => Element): boolean =>
  Predicate.hasProperty(view, "displayName")

const shown = (
  name: string,
  fields: Fields,
  services: ReadonlyArray<string>,
  view: (props: Props) => Element,
  props: Props,
) =>
  Effect.flatMap(Effect.context(), (context) =>
    ViewScope.use((mounted) =>
      Effect.map(
        drawingIn(context, () =>
          isNamedView(view) ? view(props) : drawn(name, fields, props, view(props)),
        ),
        (element) => {
          placed(() => pathOf(mounted), services)

          return element
        },
      ),
    ),
  )

const made = (
  steps: ReadonlyArray<Step>,
  view: (props: Props) => Element,
  name: string,
  at: string,
) => {
  const fields = fieldsOf(steps)
  const mount = (outer: Props) =>
    Effect.withSpan(
      inViewScope(
        Effect.flatMap(applied(steps, outer), (props) =>
          shown(name, fields, servicesOf(steps), view, props),
        ),
        name,
        at,
      ),
      name,
      { captureStackTrace: false, attributes: { "spar.kind": "view" } },
    )

  return component(
    Object.assign((props: Props) => view(props), { displayName: name, props: fields, at }),
    mount,
  )
}

const isView = (given: unknown): given is (props: Props) => Element => typeof given === "function"

export function compose<O, A, EA, RA>(a: Enhancer<O, A, EA, RA>): Composed<O, O & A, A, EA, RA>
export function compose<O, A, EA, RA, B, EB, RB>(
  a: Enhancer<O, A, EA, RA>,
  b: Enhancer<O & A, B, EB, RB>,
): Composed<O, O & A & B, A & B, EA | EB, RA | RB>
export function compose<O, A, EA, RA, B, EB, RB, C, EC, RC>(
  a: Enhancer<O, A, EA, RA>,
  b: Enhancer<O & A, B, EB, RB>,
  c: Enhancer<O & A & B, C, EC, RC>,
): Composed<O, O & A & B & C, A & B & C, EA | EB | EC, RA | RB | RC>
export function compose<O, A, EA, RA, B, EB, RB, C, EC, RC, D, ED, RD>(
  a: Enhancer<O, A, EA, RA>,
  b: Enhancer<O & A, B, EB, RB>,
  c: Enhancer<O & A & B, C, EC, RC>,
  d: Enhancer<O & A & B & C, D, ED, RD>,
): Composed<O, O & A & B & C & D, A & B & C & D, EA | EB | EC | ED, RA | RB | RC | RD>
export function compose<O, A, EA, RA, B, EB, RB, C, EC, RC, D, ED, RD, F, EF, RF>(
  a: Enhancer<O, A, EA, RA>,
  b: Enhancer<O & A, B, EB, RB>,
  c: Enhancer<O & A & B, C, EC, RC>,
  d: Enhancer<O & A & B & C, D, ED, RD>,
  f: Enhancer<O & A & B & C & D, F, EF, RF>,
): Composed<
  O,
  O & A & B & C & D & F,
  A & B & C & D & F,
  EA | EB | EC | ED | EF,
  RA | RB | RC | RD | RF
>
export function compose<O, A, EA, RA, B, EB, RB, C, EC, RC, D, ED, RD, F, EF, RF, G, EG, RG>(
  a: Enhancer<O, A, EA, RA>,
  b: Enhancer<O & A, B, EB, RB>,
  c: Enhancer<O & A & B, C, EC, RC>,
  d: Enhancer<O & A & B & C, D, ED, RD>,
  f: Enhancer<O & A & B & C & D, F, EF, RF>,
  g: Enhancer<O & A & B & C & D & F, G, EG, RG>,
): Composed<
  O,
  O & A & B & C & D & F & G,
  A & B & C & D & F & G,
  EA | EB | EC | ED | EF | EG,
  RA | RB | RC | RD | RF | RG
>
export function compose(...steps: ReadonlyArray<Step>): (given: unknown, name?: string) => unknown {
  const at = Diagnostics.locationIn(new Error("where this component was made").stack, 1)

  return (given, name) =>
    isView(given)
      ? made(steps, given, name ?? "Component", at)
      : applied(steps, isProps(given) ? given : {})
}

export const withProps = <const F extends Fields>(
  fields: F,
): Enhancer<Schema.Struct<F>["Type"], unknown> =>
  Object.assign(() => Effect.succeed({}), { fields })

export const withStore =
  <Id, Service, Add>(
    store: Context.Key<Id, Service>,
    read: (store: Service) => Add,
  ): Enhancer<unknown, Add, never, Id> =>
  () =>
    Effect.map(Effect.service(store), read)

export const withUiState =
  <const Name extends string, A, Encoded>(
    name: Name,
    schema: Schema.Codec<A, Encoded>,
    initial: NoInfer<A>,
  ): Enhancer<unknown, Record<Name, UiState.UiState<A>>, never, ViewScope> =>
  () =>
    Effect.map(UiState.make(name, schema, initial), (state) => Record.singleton(name, state))

export const withQuery =
  <const Name extends string, In, I, A, E, R>(
    name: Name,
    query: {
      readonly ask: (input: Query.Input<I>) => Effect.Effect<Query.Handle<A, E>, never, R>
    },
    input: (props: In) => Query.Input<I>,
  ): Enhancer<In, Record<Name, Query.Handle<A, E>>, never, R> =>
  (props) =>
    Effect.map(query.ask(input(props)), (handle) => Record.singleton(name, handle))

export const withHandlers =
  <In, Add>(make: (props: In) => Add): Enhancer<In, Add> =>
  (props) =>
    Effect.sync(() => make(props))

export const withKey =
  <In>(
    key: string,
    action: (props: In) => Action,
  ): Enhancer<In, unknown, never, Scope.Scope | ViewScope> =>
  (props) =>
    Effect.as(
      Events.onWindow("keydown", (event) => (event.key === key ? action(props) : [])),
      {},
    )

export const withEffect =
  <In, R>(
    run: (props: In) => Effect.Effect<unknown, never, R>,
  ): Enhancer<In, unknown, never, R | Scope.Scope> =>
  (props) =>
    Effect.as(Effect.forkScoped(run(props)), {})

export const withSpan =
  <In, Add, E, R>(name: string, inner: Enhancer<In, Add, E, R>): Enhancer<In, Add, E, R> =>
  (props) =>
    Effect.withSpan(inner(props), name, { captureStackTrace: false })

export const For = <A>(props: {
  readonly each: Reactive<ReadonlyArray<A>> | ReadonlyArray<A>
  readonly by: (item: A) => string
  readonly children: (item: Reactive<A>, key: string) => Element
}): Element => {
  const context = drawnHere()

  return keyed({
    kind: "drawn",
    items: isReactive(props.each) ? props.each : succeed(props.each),
    key: props.by,
    draw: (key, item) =>
      drawingNow(Context.add(context, RowKey, key), () => props.children(item, key)),
  })
}

const once: ReadonlyArray<"shown"> = ["shown"]

export const Show = (props: {
  readonly when: Reactive<boolean>
  readonly children: Element
}): Element =>
  keyed({
    kind: "drawn",
    items: map(props.when, (on) => (on ? once : [])),
    key: (only: "shown") => only,
    draw: () => props.children,
  })
