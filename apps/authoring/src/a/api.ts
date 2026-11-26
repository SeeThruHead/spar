import type { Context, Effect, Schema } from "effect"
import type { Action, Element, Query, Store, UiState, View } from "spar"
import type { All, Compose, Outside, Step } from "../lab/core.ts"

export declare const compose: Compose

export declare const all: All

export declare const withProps: <const F extends Schema.Struct.Fields>(
  fields: F,
) => Step<Schema.Struct<F>["Type"], unknown>

export declare const withStore: <Id, Service, Add>(
  store: Context.Key<Id, Service>,
  read: (store: Service) => Add,
) => Step<unknown, Add, never, Id>

export declare const withUiState: <const Name extends string, A, Encoded>(
  name: Name,
  schema: Schema.Codec<A, Encoded>,
  initial: NoInfer<A>,
) => Step<unknown, { readonly [K in Name]: UiState.UiState<A> }>

export declare const withQuery: <const Name extends string, In, I, A, E, R>(
  name: Name,
  query: {
    readonly ask: (input: Query.Input<I>) => Effect.Effect<Query.Handle<A, E>, never, R>
  },
  input: (props: In) => Query.Input<I>,
) => Step<In, { readonly [K in Name]: Query.Handle<A, E> }, never, Outside<R>>

export declare const withChild: <const Name extends string, In, Props, E, R>(
  name: Name,
  child: View.Component<Props, E, R>,
  props: (props: In) => Props,
) => Step<In, { readonly [K in Name]: Element }, E, R>

export declare const withHandlers: <In, Add>(make: (props: In) => Add) => Step<In, Add>

export declare const withKey: <In>(key: string, action: (props: In) => Action) => Step<In, unknown>

export declare const withEffect: <In, E, R>(
  run: (props: In) => Effect.Effect<void, E, R>,
) => Step<In, unknown, E, Outside<R>>

export declare const withSpan: (
  name: string,
  attributes?: Readonly<Record<string, string>>,
) => Step<unknown, unknown>
