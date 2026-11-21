import type { Context, Effect, Schema } from "effect"
import type { Store, View } from "spar"
import type { All, Compose, Outside, Step } from "../lab/core.ts"

export declare const compose: Compose

export declare const all: All

export declare const child: typeof View.child

export declare const props: <const F extends Schema.Struct.Fields>(
  fields: F,
) => Step<Schema.Struct<F>["Type"], unknown>

export declare const service: <const Name extends string, Id, Service>(
  name: Name,
  key: Context.Key<Id, Service>,
) => Step<unknown, { readonly [K in Name]: Service }, never, Id>

export declare const bind: <const Name extends string, In, A, E, R>(
  name: Name,
  make: (props: In) => Effect.Effect<A, E, R>,
) => Step<In, { readonly [K in Name]: A }, E, Outside<R>>

declare const let_: <const Name extends string, In, A>(
  name: Name,
  make: (props: In) => A,
) => Step<In, { readonly [K in Name]: A }>

export { let_ as let }

export declare const tap: <In, E, R>(
  run: (props: In) => Effect.Effect<unknown, E, R>,
) => Step<In, unknown, E, Outside<R>>

export declare const withSpan: (
  name: string,
  attributes?: Readonly<Record<string, string>>,
) => Step<unknown, unknown>
