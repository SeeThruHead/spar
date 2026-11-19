import {
  Clock,
  Duration,
  Effect,
  Formatter,
  Option,
  Record,
  Schedule,
  Schema,
  Stream,
  Tracer,
} from "effect"
import { sourceOf, sourced } from "./internal/inspect.ts"
import type { Action } from "./internal/journal.ts"
import { isReactive, map, succeed, zip } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import * as Events from "./Events.ts"
import * as Store from "./Store.ts"
import * as Timeline from "./Timeline.ts"
import type { Mountable } from "./View.ts"

export const Status = Schema.Literals(["waiting", "loading", "loaded", "failed"])

export type Status = typeof Status.Type

export type Entry<A, E> = {
  readonly status: "loading" | "loaded" | "failed"
  readonly value: A | null
  readonly error: E | null
  readonly loadedAt: number | null
  readonly request: number
  readonly input: Schema.Json
  readonly traceId: string
  readonly spanId: string
}

export type State<A, E> = { readonly entries: Readonly<Record<string, Entry<A, E>>> }

export type Input<I> = I | Reactive<I> | Reactive<Option.Option<I>>

export type Handle<A, E> = {
  readonly status: Reactive<Status>
  readonly value: Reactive<A | null>
  readonly error: Reactive<E | null>
  readonly loading: Reactive<boolean>
  readonly refetch: Effect.Effect<void>
}

type Asked = { readonly key: string; readonly input: Schema.Json }

const isFresh = <A, E>(entry: Entry<A, E>, now: number, staleAfter: number): boolean => {
  if (entry.status === "loading") return true
  if (entry.status !== "loaded" || entry.loadedAt === null) return false

  return now - entry.loadedAt <= staleAfter
}

const answersAnother = <A, E>(
  state: State<A, E>,
  answer: { readonly key: string; readonly request: number },
): string | null =>
  state.entries[answer.key]?.request === answer.request ? null : "This answers an earlier request"

const settled = <A, E>(
  state: State<A, E>,
  key: string,
  change: (before: Entry<A, E>) => Entry<A, E>,
): State<A, E> => ({
  entries: Record.map(state.entries, (entry, name) => (name === key ? change(entry) : entry)),
})

const linksTo = (entry: { readonly traceId: string; readonly spanId: string }) =>
  entry.traceId === ""
    ? []
    : [
        {
          span: Tracer.externalSpan({
            traceId: entry.traceId,
            spanId: entry.spanId,
            sampled: true,
          }),
          attributes: {},
        },
      ]

const keyOf = (asked: Option.Option<Asked>): string | null =>
  Option.getOrNull(Option.map(asked, (target) => target.key))

const sameKey = (one: Option.Option<Asked>, other: Option.Option<Asked>): boolean =>
  keyOf(one) === keyOf(other)

const returning = (present: Reactive<boolean>): Stream.Stream<boolean> =>
  Stream.filter(
    Stream.drop(Stream.changes(Stream.concat(Stream.fromEffect(present.get), present.changes)), 1),
    (now) => now,
  )

const optional = <I>(given: I | Option.Option<I>): Option.Option<I> =>
  Option.isOption(given) ? given : Option.some(given)

const statusOf = <A, E>(entry: Entry<A, E> | undefined): Status =>
  entry === undefined ? "waiting" : entry.status

export const Tag =
  <Self>() =>
  <const Key extends string, I, A, E, R = never>(
    key: Key,
    options: {
      readonly input: Schema.Codec<I, unknown>
      readonly success: Schema.Codec<A, unknown>
      readonly failure: Schema.Codec<E, unknown>
      readonly load: (input: I) => Effect.Effect<A, E, R>
      readonly staleAfter?: Duration.Input
      readonly retry?: Schedule.Schedule<unknown, E>
    },
  ) => {
    const staleAfter = Duration.toMillis(Duration.fromInputUnsafe(options.staleAfter ?? 0))
    const inputJson = Schema.toCodecJson(options.input)
    const entry: Schema.Codec<Entry<A, E>, unknown> = Schema.Struct({
      status: Schema.Literals(["loading", "loaded", "failed"]),
      value: Schema.NullOr(options.success),
      error: Schema.NullOr(options.failure),
      loadedAt: Schema.NullOr(Schema.Finite),
      request: Schema.Int,
      input: Schema.Json,
      traceId: Schema.String,
      spanId: Schema.String,
    })
    const state: Schema.Codec<State<A, E>, unknown> = Schema.Struct({
      entries: Schema.Record(Schema.String, entry),
    })
    const initialState: State<A, E> = { entries: {} }
    const base = Store.Tag<Self>()(key, {
      state,
      initialState,
      actions: {
        requested: Store.action(
          Schema.Struct({
            key: Schema.String,
            input: Schema.Json,
            after: Schema.NullOr(Schema.String),
            traceId: Schema.String,
            spanId: Schema.String,
          }),
          (before: State<A, E>, asked): State<A, E> => ({
            entries: {
              ...before.entries,
              [asked.key]: {
                value: before.entries[asked.key]?.value ?? null,
                error: before.entries[asked.key]?.error ?? null,
                loadedAt: before.entries[asked.key]?.loadedAt ?? null,
                request: (before.entries[asked.key]?.request ?? 0) + 1,
                status: "loading",
                input: asked.input,
                traceId: asked.traceId,
                spanId: asked.spanId,
              },
            },
          }),
          (before, asked) =>
            before.entries[asked.key]?.status === "loading" ? "It is already loading" : null,
        ),
        loaded: Store.action(
          Schema.Struct({
            key: Schema.String,
            request: Schema.Int,
            value: options.success,
            at: Schema.Finite,
          }),
          (before: State<A, E>, answer): State<A, E> =>
            settled(before, answer.key, (held) => ({
              ...held,
              status: "loaded",
              value: answer.value,
              error: null,
              loadedAt: answer.at,
            })),
          answersAnother,
        ),
        failed: Store.action(
          Schema.Struct({ key: Schema.String, request: Schema.Int, error: options.failure }),
          (before: State<A, E>, answer): State<A, E> =>
            settled(before, answer.key, (held) => ({
              ...held,
              status: "failed",
              error: answer.error,
            })),
          answersAnother,
        ),
        invalidated: Store.action(Schema.Void, (before: State<A, E>): State<A, E> => ({
          entries: Record.map(before.entries, (held) => ({ ...held, loadedAt: null })),
        })),
      },
      selectors: {
        entries: Store.selector(
          Schema.Record(Schema.String, entry),
          (now: State<A, E>) => now.entries,
        ),
      },
    })
    const loads = Store.after(base.actions.requested, (asked, now: State<A, E>, send) =>
      Effect.forEach(
        Option.toArray(Option.fromNullishOr(now.entries[asked.key])),
        ({ request }) => Effect.annotateSpans(answered(asked, request, send), "spar.kind", "data"),
        { discard: true },
      ),
    )
    const answered = (
      asked: { readonly key: string; readonly input: Schema.Json },
      request: number,
      send: Store.Send<State<A, E>>,
    ) =>
      Effect.matchEffect(
        Effect.flatMap(Effect.orDie(Schema.decodeEffect(inputJson)(asked.input)), (input) =>
          Effect.retry(options.load(input), options.retry ?? Schedule.recurs(0)),
        ),
        {
          onFailure: (error) => send(base.actions.failed, { key: asked.key, request, error }),
          onSuccess: (value) =>
            Effect.flatMap(Clock.currentTimeMillis, (at) =>
              send(base.actions.loaded, { key: asked.key, request, value, at }),
            ),
        },
      )
    const askedFor = (input: Option.Option<I>): Option.Option<Asked> =>
      Option.map(Option.flatMap(input, Schema.encodeUnknownOption(inputJson)), (encoded) => ({
        key: Formatter.formatJson(encoded),
        input: encoded,
      }))
    const optionalOf = (given: Input<I>): Reactive<Option.Option<I>> =>
      isReactive(given)
        ? map<I | Option.Option<I>, Option.Option<I>>(given, optional)
        : succeed(Option.some(given))
    const ensured = Effect.fnUntraced(function* (
      asked: Option.Option<Asked>,
      after: string | null,
    ) {
      const store = yield* Effect.service(base)
      const now = yield* Clock.currentTimeMillis
      const held = yield* store.state.get
      const span = yield* Effect.option(Effect.currentSpan)
      const from = Option.match(span, {
        onNone: () => ({ traceId: "", spanId: "" }),
        onSome: (current) => ({ traceId: current.traceId, spanId: current.spanId }),
      })

      yield* Effect.forEach(
        Option.toArray(asked),
        (wanted) => {
          const known = held.entries[wanted.key]
          if (known !== undefined && isFresh(known, now, staleAfter)) return served(wanted, known)

          return Effect.annotateSpans(store.commands.requested({ ...wanted, after, ...from }), {
            "spar.kind": "data",
            "spar.query.after": after ?? "",
          })
        },
        { discard: true },
      )
    })
    const served = (wanted: Asked, hit: Entry<A, E>) =>
      Effect.withSpan(
        Timeline.note("data", `${key}/served`, () => ({ key: wanted.key, from: hit.traceId })),
        `${key}/served`,
        {
          captureStackTrace: false,
          attributes: { "spar.kind": "data", "spar.query.served_from": hit.traceId },
          links: linksTo(hit),
        },
      )
    const ask = Effect.fnUntraced(function* (input: Input<I>) {
      const store = yield* Effect.service(base)
      const wanted = map(optionalOf(input), askedFor)
      const after = Option.getOrNull(sourceOf(input))
      const context = yield* Effect.context<Self>()

      const first = yield* wanted.get

      yield* ensured(first, after)
      yield* Effect.forkScoped(
        Stream.runForEach(
          Stream.drop(
            Stream.changesWith(Stream.concat(Stream.succeed(first), wanted.changes), sameKey),
            1,
          ),
          (next) => Effect.provide(ensured(next, after), context),
        ),
        { startImmediately: true },
      )

      const visible = yield* Events.visible
      const online = yield* Events.online

      yield* Effect.forkScoped(
        Stream.runForEach(Stream.merge(returning(visible), returning(online)), () =>
          Effect.flatMap(wanted.get, (asked) => Effect.provide(ensured(asked, after), context)),
        ),
        { startImmediately: true },
      )

      const both = yield* zip(store.state, wanted)
      const held = map(both, ([now, asked]) =>
        Option.getOrUndefined(Option.map(asked, (target) => now.entries[target.key])),
      )

      const value = map(held, (entryNow) => entryNow?.value ?? null)

      sourced(value, `${key} . value`)

      return {
        status: map(held, statusOf),
        value,
        error: map(held, (entryNow) => entryNow?.error ?? null),
        loading: map(held, (entryNow) => entryNow?.status === "loading"),
        refetch: Effect.flatMap(wanted.get, (asked) =>
          Effect.forEach(
            Option.toArray(asked),
            (target) => store.commands.requested({ ...target, after, traceId: "", spanId: "" }),
            { discard: true },
          ),
        ),
      }
    })
    const read = (input: I): Effect.Effect<A | null, never, Self> =>
      Effect.map(
        Effect.flatMap(Effect.service(base), (store) => store.state.get),
        (now) =>
          Option.getOrNull(
            Option.flatMap(askedFor(Option.some(input)), (asked) =>
              Option.fromNullishOr(now.entries[asked.key]?.value),
            ),
          ),
      )
    const invalidate = Effect.gen(function* () {
      const store = yield* Effect.service(base)
      const before = yield* store.state.get

      yield* store.commands.invalidated()
      yield* Effect.forEach(
        Record.toEntries(before.entries),
        ([name, held]) =>
          store.commands.requested({
            key: name,
            input: held.input,
            after: null,
            traceId: "",
            spanId: "",
          }),
        { discard: true },
      )
    })

    return class extends base {
      static readonly loads = loads
      static readonly live = base.layer([loads])
      static readonly beside = <Props, EC = never, RC = never, ViewProps = never>(
        self: Mountable<Props, EC, RC, ViewProps>,
      ) => base.with(self, [loads])
      static readonly ask = ask
      static readonly read = read
      static readonly invalidate = invalidate
      static readonly invalidatedBy = <Other, Payload>(action: Action<Other, Payload>) =>
        Store.after(action, () => invalidate)
    }
  }
