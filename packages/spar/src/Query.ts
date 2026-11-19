import { Clock, Duration, Effect, Schema } from "effect"
import type { Action } from "./internal/journal.ts"
import * as Store from "./Store.ts"
import type { Mountable } from "./View.ts"

export const Status = Schema.Literals(["idle", "loading", "loaded", "failed"])

export type Status = typeof Status.Type

export type State<A, E> = {
  readonly status: Status
  readonly value: A | null
  readonly error: E | null
  readonly loadedAt: number | null
  readonly request: number
}

const answersAnother = (state: { readonly request: number }, request: number): string | null =>
  state.request === request ? null : "This answers an earlier request"

const isFresh = <A, E>(state: State<A, E>, now: number, staleAfter: number): boolean => {
  if (state.status === "loading") return true
  if (state.status !== "loaded" || state.loadedAt === null) return false

  return now - state.loadedAt <= staleAfter
}

export const Tag =
  <Self>() =>
  <const Key extends string, A, E, R = never>(
    key: Key,
    options: {
      readonly success: Schema.Codec<A, unknown>
      readonly failure: Schema.Codec<E, unknown>
      readonly load: Effect.Effect<A, E, R>
      readonly staleAfter?: Duration.Input
    },
  ) => {
    const staleAfter = Duration.toMillis(Duration.fromInputUnsafe(options.staleAfter ?? 0))
    const state: Schema.Codec<State<A, E>, unknown> = Schema.Struct({
      status: Status,
      value: Schema.NullOr(options.success),
      error: Schema.NullOr(options.failure),
      loadedAt: Schema.NullOr(Schema.Finite),
      request: Schema.Int,
    })
    const initialState: State<A, E> = {
      status: "idle",
      value: null,
      error: null,
      loadedAt: null,
      request: 0,
    }
    const base = Store.Tag<Self>()(key, {
      state,
      initialState,
      actions: {
        requested: Store.action(
          Schema.Void,
          (before: State<A, E>): State<A, E> => ({
            ...before,
            status: "loading",
            request: before.request + 1,
          }),
          (before) => (before.status === "loading" ? "It is already loading" : null),
        ),
        loaded: Store.action(
          Schema.Struct({ request: Schema.Int, value: options.success, at: Schema.Finite }),
          (before: State<A, E>, answer): State<A, E> => ({
            ...before,
            status: "loaded",
            value: answer.value,
            error: null,
            loadedAt: answer.at,
          }),
          (before, answer) => answersAnother(before, answer.request),
        ),
        failed: Store.action(
          Schema.Struct({ request: Schema.Int, error: options.failure }),
          (before: State<A, E>, answer): State<A, E> => ({
            ...before,
            status: "failed",
            error: answer.error,
          }),
          (before, answer) => answersAnother(before, answer.request),
        ),
        invalidated: Store.action(Schema.Void, (before: State<A, E>): State<A, E> => ({
          ...before,
          loadedAt: null,
        })),
      },
      selectors: {
        status: Store.selector(Status, (now: State<A, E>) => now.status),
        value: Store.selector(Schema.NullOr(options.success), (now: State<A, E>) => now.value),
        error: Store.selector(Schema.NullOr(options.failure), (now: State<A, E>) => now.error),
        loading: Store.selector(Schema.Boolean, (now: State<A, E>) => now.status === "loading"),
      },
    })
    const loads = Store.after(base.actions.requested, (_payload, now: State<A, E>, send) =>
      Effect.matchEffect(options.load, {
        onFailure: (error) => send(base.actions.failed, { request: now.request, error }),
        onSuccess: (value) =>
          Effect.flatMap(Clock.currentTimeMillis, (at) =>
            send(base.actions.loaded, { request: now.request, value, at }),
          ),
      }),
    )
    const ensure = Effect.gen(function* () {
      const store = yield* Effect.service(base)
      const now = yield* Clock.currentTimeMillis
      const held = yield* store.state.get
      if (isFresh(held, now, staleAfter)) return

      yield* store.commands.requested()
    })
    const refetch = Effect.flatMap(Effect.service(base), (store) => store.commands.requested())
    const invalidate = Effect.flatMap(Effect.service(base), (store) =>
      Effect.andThen(store.commands.invalidated(), store.commands.requested()),
    )

    return class extends base {
      static readonly loads = loads
      static readonly live = base.layer([loads])
      static readonly beside = <Props, EC = never, RC = never, ViewProps = never>(
        self: Mountable<Props, EC, RC, ViewProps>,
      ) => base.with(self, [loads])
      static readonly ensure = ensure
      static readonly refetch = refetch
      static readonly invalidate = invalidate
      static readonly invalidatedBy = <Other, Payload>(action: Action<Other, Payload>) =>
        Store.after(action, () => invalidate)
    }
  }
