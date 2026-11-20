import { Context, Effect, Layer, Option, Schema, Scope } from "effect"
import { KeyValueStore } from "effect/persistence"
import * as Cell from "./internal/cell.ts"
import { fromCell, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"

export type Written = {
  readonly seq: number
  readonly key: string
  readonly name: string
  readonly value: Schema.Json
  readonly traceId: string
  readonly spanId: string
}

export type Slot<A> = {
  readonly value: Reactive<A>
  readonly set: (name: string, next: A) => Effect.Effect<void>
  readonly update: (name: string, change: (now: A) => A) => Effect.Effect<void>
}

type Held = {
  readonly cell: Cell.Cell<Schema.Json>
  readonly users: number
  readonly initial: Schema.Json
}

export class State extends Context.Service<
  State,
  {
    readonly slot: <A, I>(
      key: ReadonlyArray<string>,
      schema: Schema.Codec<A, I>,
      initial: A,
    ) => Effect.Effect<Slot<A>, never, Scope.Scope>
    readonly log: Reactive<ReadonlyArray<Written>>
    readonly tree: Reactive<ReadonlyMap<string, Schema.Json>>
    readonly viewing: Reactive<number | null>
    readonly travelTo: (seq: number | null) => Effect.Effect<void>
    readonly fork: Effect.Effect<void>
  }
>()("spar/State") {}

const keyOf = (path: ReadonlyArray<string>): string => path.join(" / ")

const without = <V>(entries: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> =>
  new Map([...entries].filter(([name]) => name !== key))

const tracedBy = Effect.map(Effect.option(Effect.currentSpan), (span) =>
  Option.match(span, {
    onNone: () => ({ traceId: "", spanId: "" }),
    onSome: (current) => ({ traceId: current.traceId, spanId: current.spanId }),
  }),
)

const make = Effect.sync(() => {
  const held = Cell.make<ReadonlyMap<string, Held>>(new Map())
  const tree = Cell.make<ReadonlyMap<string, Schema.Json>>(new Map())
  const log = Cell.make<ReadonlyArray<Written>>([])
  const viewing = Cell.make<number | null>(null)

  const counted = (key: string, kept: Omit<Held, "users">, by: number): number => {
    const users = (held.read().get(key)?.users ?? 0) + by

    held.write(new Map([...held.read(), [key, { ...kept, users }]]))

    return users
  }

  const joined = (key: string, initial: Schema.Json): Omit<Held, "users"> => {
    const kept = held.read().get(key) ?? { cell: Cell.make(initial), initial }

    counted(key, kept, 1)
    tree.write(new Map([...tree.read(), [key, kept.cell.read()]]))

    return kept
  }

  const left = (key: string, kept: Omit<Held, "users">): void => {
    if (counted(key, kept, -1) > 0) return

    held.write(without(held.read(), key))
    tree.write(without(tree.read(), key))
  }

  const valueAt = (key: string, kept: Omit<Held, "users">, seq: number): Schema.Json =>
    log.read().findLast((entry) => entry.key === key && entry.seq <= seq)?.value ?? kept.initial

  const shown = (seq: number | null): void =>
    [...held.read()].forEach(([key, kept]) =>
      kept.cell.write(valueAt(key, kept, seq ?? Number.POSITIVE_INFINITY)),
    )

  const travelTo = (seq: number | null) =>
    Effect.sync(() => {
      viewing.write(seq)
      shown(seq)
    })

  const fork = Effect.sync(() => {
    const at = viewing.read()
    if (at === null) return

    log.write(log.read().filter((entry) => entry.seq <= at))
    tree.write(new Map([...held.read()].map(([key, kept]) => [key, valueAt(key, kept, at)])))
    viewing.write(null)
    shown(null)
  })

  const written = (key: string, cell: Cell.Cell<Schema.Json>, name: string, value: Schema.Json) =>
    Effect.flatMap(tracedBy, (trace) =>
      Effect.andThen(
        travelTo(null),
        Effect.sync(() => {
          cell.write(value)
          tree.write(new Map([...tree.read(), [key, value]]))
          log.write([...log.read(), { seq: log.read().length + 1, key, name, value, ...trace }])
        }),
      ),
    )

  const slot = <A, I>(
    path: ReadonlyArray<string>,
    schema: Schema.Codec<A, I>,
    initial: A,
  ): Effect.Effect<Slot<A>, never, Scope.Scope> => {
    const key = keyOf(path)
    const json = Schema.toCodecJson(schema)
    const encode = Schema.encodeSync(json)
    const decode = Schema.decodeSync(json)

    return Effect.map(
      Effect.acquireRelease(
        Effect.sync(() => joined(key, encode(initial))),
        (kept) => Effect.sync(() => left(key, kept)),
      ),
      ({ cell }) => {
        const set = (name: string, next: A) => written(key, cell, name, encode(next))

        return {
          value: map(fromCell(cell), decode),
          set,
          update: (name, change) => Effect.suspend(() => set(name, change(decode(cell.read())))),
        }
      },
    )
  }

  return State.of({
    slot,
    log: fromCell(log),
    tree: fromCell(tree),
    viewing: fromCell(viewing),
    travelTo,
    fork,
  })
})

export const layer: Layer.Layer<State> = Layer.effect(State, make)

export const Tag =
  <Self>() =>
  <const Key extends string, A, I>(key: Key, schema: Schema.Codec<A, I>, initial: NoInfer<A>) => {
    const service = Context.Service<Self, Slot<A>>()(key)

    return class extends service {
      static readonly layer = Layer.effect(
        service,
        Effect.flatMap(Effect.service(State), (state) => state.slot([key], schema, initial)),
      )
    }
  }

const savedSlot = (state: State["Service"], store: KeyValueStore.KeyValueStore) =>
  Effect.fnUntraced(function* <A, I>(
    path: ReadonlyArray<string>,
    schema: Schema.Codec<A, I>,
    initial: A,
  ): Effect.fn.Return<Slot<A>, never, Scope.Scope> {
    const key = `spar/state/${keyOf(path)}`
    const text = Schema.fromJsonString(Schema.toCodecJson(schema))
    const kept = yield* Effect.orDie(store.get(key))
    const start = Option.getOrElse(
      Option.flatMap(Option.fromUndefinedOr(kept), Schema.decodeUnknownOption(text)),
      () => initial,
    )
    const inner = yield* state.slot(path, schema, start)
    const set = (name: string, next: A) =>
      Effect.andThen(
        inner.set(name, next),
        Effect.orDie(store.set(key, Schema.encodeSync(text)(next))),
      )

    return {
      value: inner.value,
      set,
      update: (name, change) => Effect.flatMap(inner.value.get, (now) => set(name, change(now))),
    }
  })

export const saved: Layer.Layer<State, never, State | KeyValueStore.KeyValueStore> = Layer.effect(
  State,
  Effect.gen(function* () {
    const state = yield* State
    const store = yield* KeyValueStore.KeyValueStore

    return State.of({ ...state, slot: savedSlot(state, store) })
  }),
)
