import type * as Aggregate from "@alchemy.run/domain/Aggregate"
import type { Context, Effect, Option, Schema } from "effect"
import type { Action, Element, Query, Reactive, View } from "spar"
import type { All, Compose, Outside, Step } from "../lab/core.ts"

export type Value<A> = Reactive.Reactive<A> & {
  readonly map: <B>(change: (value: A) => B) => Value<B>
}

export type Toggle = Value<boolean> & {
  readonly toggle: Action
  readonly set: (value: boolean) => Action
  readonly when: (shown: Element) => Element
}

export type Slot<A> = Value<A> & { readonly set: (value: A) => Action }

type Held<A> = [A] extends [boolean] ? Toggle : Slot<A>

type Hosted = { readonly definition: Aggregate.AnyDefinition }

type CommandOf<Agg extends Hosted> = InstanceType<Agg["definition"]["commands"][number]>

type RejectionOf<Agg extends Hosted> = InstanceType<
  Agg["definition"]["commands"][number]["rejects"][number]
>

export type DomainStore<Agg extends Hosted> = {
  readonly select: <A>(read: (state: Agg["definition"]["state"]["Type"]) => A) => Value<A>
  readonly send: (command: CommandOf<Agg>) => Action
  readonly lastRejection: Value<Option.Option<RejectionOf<Agg>>> & {
    readonly show: (draw: (rejection: RejectionOf<Agg>) => Element) => Element
  }
}

export declare const compose: Compose

export declare const all: All

export declare const props: <const F extends Schema.Struct.Fields>(
  fields: F,
) => Step<Schema.Struct<F>["Type"], unknown>

export declare const store: <Agg extends Hosted, Add>(
  aggregate: Agg,
  id: Agg["definition"]["id"]["Type"],
  read: (store: DomainStore<Agg>) => Add,
) => Step<unknown, Add, never, Agg>

export declare const plainStore: <Id, Service, Add>(
  key: Context.Key<Id, Service>,
  read: (store: Service) => Add,
) => Step<unknown, Add, never, Id>

export declare const uiState: <const Name extends string, A, Encoded>(
  name: Name,
  schema: Schema.Codec<A, Encoded>,
  initial: NoInfer<A>,
) => Step<unknown, { readonly [K in Name]: Held<A> }>

export declare const query: <const Name extends string, In, I, A, E, R>(
  name: Name,
  asked: {
    readonly ask: (input: Query.Input<I>) => Effect.Effect<Query.Handle<A, E>, never, R>
  },
  input: (props: In) => Query.Input<I>,
) => Step<In, { readonly [K in Name]: Query.Handle<A, E> }, never, Outside<R>>

export declare const child: <const Name extends string, In, Props, E, R>(
  name: Name,
  component: View.Component<Props, E, R>,
  props: (props: In) => Props,
) => Step<In, { readonly [K in Name]: Element }, E, R>

export declare const onKey: <In>(key: string, action: (props: In) => Action) => Step<In, unknown>

export declare const withSpan: (
  name: string,
  attributes?: Readonly<Record<string, string>>,
) => Step<unknown, unknown>
