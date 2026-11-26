import { Cause, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Reactive } from "spar"
import type { Query } from "spar"

export type Status = "waiting" | "loading" | "loaded" | "failed"

const settledStatus = <A, E>(result: AsyncResult.AsyncResult<A, E>): Status => {
  if (AsyncResult.isSuccess(result)) return "loaded"
  if (AsyncResult.isFailure(result)) return "failed"

  return "waiting"
}

export const statusIn = <A, E>(result: AsyncResult.AsyncResult<A, E>): Status =>
  result.waiting ? "loading" : settledStatus(result)

export const valueIn = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | null =>
  Option.getOrNull(AsyncResult.value(result))

export const errorIn = <A, E>(result: AsyncResult.AsyncResult<A, E>): E | null =>
  AsyncResult.isFailure(result) ? Option.getOrNull(Cause.findErrorOption(result.cause)) : null

export const statusOf = <A, E>(handle: Query.Handle<A, E>): Reactive.Reactive<Status> =>
  Reactive.map(handle.result, statusIn)

export const valueOf = <A, E>(handle: Query.Handle<A, E>): Reactive.Reactive<A | null> =>
  Reactive.map(handle.result, valueIn)

export const errorOf = <A, E>(handle: Query.Handle<A, E>): Reactive.Reactive<E | null> =>
  Reactive.map(handle.result, errorIn)
