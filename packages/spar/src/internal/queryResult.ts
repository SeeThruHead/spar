import { Cause, Option } from "effect"
import { AsyncResult } from "effect/reactivity"

export type Held<A, E> = {
  readonly status: "loading" | "loaded" | "failed"
  readonly value: A | null
  readonly error: E | null
  readonly loadedAt: number | null
}

const settledOf = <A, E>(entry: Held<A, E>, kept: A | null): AsyncResult.AsyncResult<A, E> => {
  const timestamp = entry.loadedAt ?? 0
  const shown = entry.value ?? kept
  const previous = Option.map(Option.fromNullishOr(shown), (value) =>
    AsyncResult.success<A, E>(value, { timestamp }),
  )

  if (entry.error !== null) {
    return AsyncResult.failure(Cause.fail(entry.error), { previousSuccess: previous })
  }

  return Option.getOrElse(previous, () => AsyncResult.initial<A, E>())
}

export const resultOf = <A, E>(
  entry: Held<A, E> | undefined,
  kept: A | null,
): AsyncResult.AsyncResult<A, E> => {
  if (entry === undefined) return AsyncResult.initial()

  const settled = settledOf(entry, kept)

  return entry.status === "loading" ? AsyncResult.waiting(settled) : settled
}
