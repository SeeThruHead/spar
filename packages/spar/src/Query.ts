import {
  Clock,
  Duration,
  Effect,
  Formatter,
  Layer,
  Array,
  Option,
  Predicate,
  Record,
  Schedule,
  Schema,
  Scope,
  Stream,
  Tracer,
} from "effect"
import { GivenUpSends, newIn } from "./internal/givenUp.ts"
import type { GivenUp } from "./internal/givenUp.ts"
import { sourceOf, sourced } from "./internal/inspect.ts"
import { OnServer } from "./internal/server.ts"
import { Adopters, Expected } from "./internal/pieces.ts"
import type { Action, Entry as Logged } from "./internal/journal.ts"
import * as Cell from "./internal/cell.ts"
import { fromCell, isReactive, map, observed, succeed, zip } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import * as Events from "./Events.ts"
import * as Store from "./Store.ts"
import * as Timeline from "./Timeline.ts"
import * as UiState from "./UiState.ts"
import type { Mountable } from "./View.ts"
import * as Diagnostics from "./internal/said.ts"

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
  readonly unusedSince: number | null
}

export type State<A, E> = { readonly entries: Readonly<Record<string, Entry<A, E>>> }

export type Input<I> = [I] extends [void] ? void : I | Reactive<I> | Reactive<Option.Option<I>>

export type Handle<A, E> = {
  readonly status: Reactive<Status>
  readonly value: Reactive<A | null>
  readonly error: Reactive<E | null>
  readonly loading: Reactive<boolean>
  readonly latest: Reactive<A | null>
  readonly refetch: Effect.Effect<void>
}

type Asked = { readonly key: string; readonly input: Schema.Json }

const isFresh = <A, E>(entry: Entry<A, E>, now: number, staleAfter: number): boolean => {
  if (entry.status === "loading") return true
  if (entry.status !== "loaded" || entry.loadedAt === null) return false

  return now - entry.loadedAt <= staleAfter
}

const stands = <A, E>(
  entry: Entry<A, E>,
  now: number,
  staleAfter: number,
  onServer: boolean,
): boolean => onServer || isFresh(entry, now, staleAfter)

const oldestUnused = <A, E>(state: State<A, E>): ReadonlyArray<readonly [string, number]> =>
  Record.toEntries(state.entries)
    .flatMap(([name, held]) =>
      held.unusedSince === null ? [] : [[name, held.unusedSince] as const],
    )
    .toSorted(([, left], [, right]) => left - right)

const isBack = <A, E>(users: number, entry: Entry<A, E> | undefined): boolean => {
  if (users !== 1) return false

  return Predicate.isNotNullish(entry?.unusedSince)
}

type Users = Cell.Cell<ReadonlyMap<string, number>>

const usersBy = new WeakMap<object, Users>()

const usersOf = (store: object): Users => {
  const known = usersBy.get(store)
  if (known !== undefined) return known

  const made: Users = Cell.make<ReadonlyMap<string, number>>(new Map())

  usersBy.set(store, made)

  return made
}

const counted = (users: Users, name: string, by: number): number => {
  const next = (users.read().get(name) ?? 0) + by

  users.write(new Map([...users.read(), [name, next]]))

  return next
}

const answersAnother = <A, E>(
  state: State<A, E>,
  answer: { readonly key: string; readonly request: number },
): string | null =>
  state.entries[answer.key]?.request === answer.request
    ? null
    : Diagnostics.brief("SPAR_LATE_ANSWER")

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

const optionalOf = (given: unknown): Reactive<Option.Option<unknown>> =>
  isReactive(given) ? map(given, optional) : succeed(Option.some(given))

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
      readonly dropAfter?: Duration.Input
      readonly keepAtMost?: number
    },
  ) => {
    const dropAfter = Duration.fromInputUnsafe(options.dropAfter ?? "5 minutes")
    const keepAtMost = options.keepAtMost ?? 100
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
      unusedSince: Schema.NullOr(Schema.Finite),
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
                unusedSince: before.entries[asked.key]?.unusedSince ?? null,
              },
            },
          }),
          (before, asked) =>
            before.entries[asked.key]?.status === "loading"
              ? Diagnostics.brief("SPAR_ALREADY_LOADING")
              : null,
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
        patched: Store.action(
          Schema.Struct({ key: Schema.String, value: options.success }),
          (before: State<A, E>, { key: name, value }): State<A, E> =>
            settled(before, name, (held) => ({ ...held, value })),
        ),
        released: Store.action(
          Schema.Struct({ key: Schema.String, at: Schema.Finite }),
          (before: State<A, E>, { key: name, at }): State<A, E> =>
            settled(before, name, (held) => ({ ...held, unusedSince: at })),
        ),
        held: Store.action(
          Schema.Struct({ key: Schema.String }),
          (before: State<A, E>, { key: name }): State<A, E> =>
            settled(before, name, (entryNow) => ({ ...entryNow, unusedSince: null })),
        ),
        dropped: Store.action(
          Schema.Struct({ key: Schema.String, since: Schema.Finite }),
          (before: State<A, E>, { key: name }): State<A, E> => ({
            entries: Record.remove(before.entries, name),
          }),
          (before, { key: name, since }) =>
            before.entries[name]?.unusedSince === since
              ? null
              : Diagnostics.brief("SPAR_IN_USE_AGAIN"),
        ),
        streamed: Store.action(state, (before: State<A, E>, sent): State<A, E> => ({
          entries: { ...before.entries, ...sent.entries },
        })),
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
    const loads = Store.unwatched(
      Store.after(base.actions.requested, (asked, now: State<A, E>, send) =>
        Effect.forEach(
          Option.toArray(Option.fromNullishOr(now.entries[asked.key])),
          ({ request }) =>
            Effect.annotateSpans(answered(asked, request, send), "spar.kind", "data"),
          { discard: true },
        ),
      ),
    )
    const drops = Store.afterDetached(
      base.actions.released,
      ({ key: name, at }, _now, send) =>
        Effect.andThen(
          Effect.sleep(dropAfter),
          send(base.actions.dropped, { key: name, since: at }),
        ),
      (released) => released.key,
    )
    const trims = Store.unwatched(
      Store.after(base.actions.released, (_released, now: State<A, E>, send) =>
        Effect.forEach(
          oldestUnused(now).slice(0, Math.max(Object.keys(now.entries).length - keepAtMost, 0)),
          ([name, since]) => send(base.actions.dropped, { key: name, since }),
          { discard: true },
        ),
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
    const askedFor = (input: Option.Option<unknown>): Option.Option<Asked> =>
      Option.map(Option.flatMap(input, Schema.encodeUnknownOption(inputJson)), (encoded) => ({
        key: Formatter.formatJson(encoded),
        input: encoded,
      }))
    const ensured = Effect.fnUntraced(function* (
      asked: Option.Option<Asked>,
      after: string | null,
    ) {
      const store = yield* Effect.service(base)
      const now = yield* Clock.currentTimeMillis
      const onServer = yield* OnServer
      const expected = yield* Expected
      const coming = yield* expected.get
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
          if (known === undefined && coming) return Effect.void
          if (known !== undefined && stands(known, now, staleAfter, onServer)) {
            return served(wanted, known)
          }

          return Effect.annotateSpans(store.commands.requested({ ...wanted, after, ...from }), {
            "spar.kind": "data",
            "spar.query.after": after ?? "",
            "spar.query.input": wanted.key,
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
    const asking = Effect.fnUntraced(function* (input: unknown) {
      const store = yield* Effect.service(base)
      const wanted = map(optionalOf(input), askedFor)
      const after = Option.getOrNull(sourceOf(input))
      const context = yield* Effect.context<Self>()

      const first = yield* wanted.get
      const users = usersOf(store)
      const current = Cell.make(first)
      const taken = (asked: Option.Option<Asked>) =>
        Effect.forEach(
          Option.toArray(asked),
          (target) =>
            Effect.flatMap(store.state.get, (now) =>
              isBack(counted(users, target.key, 1), now.entries[target.key])
                ? store.commands.held({ key: target.key })
                : Effect.void,
            ),
          { discard: true },
        )
      const given = (asked: Option.Option<Asked>) =>
        Effect.forEach(
          Option.toArray(asked),
          (target) =>
            counted(users, target.key, -1) === 0
              ? Effect.flatMap(Clock.currentTimeMillis, (at) =>
                  store.commands.released({ key: target.key, at }),
                )
              : Effect.void,
          { discard: true },
        )
      const moved = (next: Option.Option<Asked>) =>
        Effect.suspend(() => {
          const before = current.read()

          current.write(next)

          return Effect.andThen(given(before), taken(next))
        })

      yield* taken(first)
      yield* Effect.addFinalizer(() => Effect.suspend(() => given(current.read())))
      yield* ensured(first, after)
      yield* Effect.forkScoped(
        Stream.runForEach(
          Stream.drop(
            Stream.changesWith(Stream.concat(Stream.succeed(first), wanted.changes), sameKey),
            1,
          ),
          (next) => Effect.provide(Effect.andThen(moved(next), ensured(next, after)), context),
        ),
        { startImmediately: true },
      )

      const expected = yield* Expected
      const allSent = map(expected, (still) => !still)
      const visible = yield* Events.visible
      const online = yield* Events.online

      yield* Effect.forkScoped(
        Stream.runForEach(
          Stream.mergeAll([returning(visible), returning(online), returning(allSent)], {
            concurrency: "unbounded",
          }),
          () =>
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

      const firstValue = yield* value.get
      const kept = Cell.make<A | null>(firstValue)

      yield* observed(value, (now) => kept.write(now ?? kept.read()))

      return {
        status: map(held, statusOf),
        value,
        error: map(held, (entryNow) => entryNow?.error ?? null),
        loading: map(held, (entryNow) => entryNow?.status === "loading"),
        latest: fromCell(kept),
        refetch: Effect.flatMap(wanted.get, (asked) =>
          Effect.forEach(
            Option.toArray(asked),
            (target) => store.commands.requested({ ...target, after, traceId: "", spanId: "" }),
            { discard: true },
          ),
        ),
      }
    })
    const ask = (input: Input<I>) => asking(input)
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
    const patched = Effect.fnUntraced(function* (input: I, patch: (value: A) => A) {
      const store = yield* Effect.service(base)
      const now = yield* store.state.get
      const changed = Option.flatMap(askedFor(Option.some(input)), (asked) =>
        Option.map(Option.fromNullishOr(now.entries[asked.key]?.value), (value) => ({
          key: asked.key,
          value: patch(value),
        })),
      )

      yield* Effect.forEach(Option.toArray(changed), store.commands.patched, { discard: true })
    })
    const pages = Effect.fnUntraced(function* (paging: {
      readonly first: I
      readonly next: (page: A, input: I) => Option.Option<I>
    }) {
      const store = yield* Effect.service(base)
      const scope = yield* Effect.scope
      const context = yield* Effect.context<Self>()
      const inputs = yield* UiState.make(`${key} pages`, Schema.Array(options.input), [
        paging.first,
      ])
      const started = Cell.make<ReadonlySet<string>>(new Set())
      const nameOf = (input: I): string => Option.getOrThrow(askedFor(Option.some(input))).key
      const begin = (input: I) =>
        Effect.suspend(() => {
          if (started.read().has(nameOf(input))) return Effect.void

          started.write(new Set([...started.read(), nameOf(input)]))

          return Effect.asVoid(
            Effect.provide(Effect.provideService(asking(input), Scope.Scope, scope), context),
          )
        })
      const beginAll = (all: ReadonlyArray<I>) => Effect.forEach(all, begin, { discard: true })
      const opened = yield* inputs.get

      yield* beginAll(opened)
      yield* Effect.forkScoped(Stream.runForEach(inputs.changes, beginAll), {
        startImmediately: true,
      })

      const both = yield* zip(store.state, inputs)
      const entriesOf = ([now, all]: readonly [State<A, E>, ReadonlyArray<I>]) =>
        all.map((input) => [input, now.entries[nameOf(input)]] as const)
      const following = (seen: readonly [State<A, E>, ReadonlyArray<I>]): Option.Option<I> =>
        Option.filter(
          Option.flatMap(Array.last(entriesOf(seen)), ([input, held]) =>
            Option.flatMap(Option.fromNullishOr(held?.value), (page) => paging.next(page, input)),
          ),
          (input) => !seen[1].some((had) => nameOf(had) === nameOf(input)),
        )
      const seenFirst = yield* both.get
      const upcoming = Cell.make<Option.Option<I>>(following(seenFirst))

      yield* observed(both, (seen) => upcoming.write(following(seen)))

      return {
        pages: map(both, (seen) =>
          entriesOf(seen).flatMap(([, held]) => Option.toArray(Option.fromNullishOr(held?.value))),
        ),
        loading: map(both, (seen) =>
          entriesOf(seen).some(([, held]) => held === undefined || held.status === "loading"),
        ),
        failed: map(both, (seen) => entriesOf(seen).some(([, held]) => held?.status === "failed")),
        more: map(fromCell(upcoming), Option.isSome),
        loadMore: UiState.update(inputs, (all) => [...all, ...Option.toArray(upcoming.read())]),
      }
    })
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
    const undoneIfAlreadyGivenUp = (sentAs: string) =>
      Effect.flatMap(Effect.serviceOption(GivenUpSends), (found) =>
        Effect.forEach(
          Option.toArray(found),
          (sends) =>
            Effect.flatMap(sends.dead.get, (dead) =>
              dead.some((given) => given.key === sentAs) ? invalidate : Effect.void,
            ),
          { discard: true },
        ),
      )
    const undoneWhenGivenUp = (channel: string) =>
      Effect.flatMap(Effect.serviceOption(GivenUpSends), (found) =>
        Effect.forEach(
          Option.toArray(found),
          (sends) =>
            Effect.forkScoped(
              sends.dead.changes.pipe(
                Stream.mapAccum(
                  (): ReadonlySet<string> => new Set(),
                  (seen, now: ReadonlyArray<GivenUp>) => newIn(seen, now, channel),
                ),
                Stream.runForEach(() => invalidate),
              ),
              { startImmediately: true },
            ),
          { discard: true },
        ),
      )

    return class extends base {
      static readonly loads = loads
      static readonly live = Layer.provideMerge(
        Layer.effectDiscard(
          Effect.gen(function* () {
            const store = yield* Effect.service(base)
            const adopters = yield* Adopters

            yield* adopters.register(key, (sent) =>
              Effect.ignore(
                Effect.flatMap(
                  Schema.decodeEffect(Schema.toCodecJson(state))(sent),
                  store.commands.streamed,
                ),
              ),
            )
          }),
        ),
        base.layer([loads, drops, trims]),
      )
      static readonly beside = <Props, EC = never, RC = never, ViewProps = never>(
        self: Mountable<Props, EC, RC, ViewProps>,
      ) => base.with(self, [loads])
      static readonly ask = ask
      static readonly read = read
      static readonly invalidate = invalidate
      static readonly pages = pages
      static readonly invalidatedBy = <Other, Payload>(action: Action<Other, Payload>) =>
        Store.unwatched(Store.after(action, () => invalidate))
      static readonly patchedBy = <Other, Payload>(
        action: Action<Other, Payload>,
        input: (payload: Payload) => I,
        patch: (value: A, payload: Payload) => A,
      ) => {
        const reaction = Store.unwatched(
          Store.after(action, (payload) =>
            patched(input(payload), (value) => patch(value, payload)),
          ),
        )

        return {
          ...reaction,
          run: (logged: Logged, held: Other, sendNext: Store.Send<Other>) =>
            Effect.andThen(reaction.run(logged, held, sendNext), undoneIfAlreadyGivenUp(logged.id)),
          start: (channel: string) =>
            Effect.andThen(reaction.start(channel), undoneWhenGivenUp(channel)),
        }
      }
    }
  }
