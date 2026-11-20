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
}

export type Slot<A> = {
  readonly value: Reactive<A>
  readonly set: (name: string, next: A) => Effect.Effect<void>
  readonly update: (name: string, change: (now: A) => A) => Effect.Effect<void>
}

type Held = { readonly cell: Cell.Cell<Schema.Json>; readonly users: number }

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
  }
>()("spar/State") {}

const keyOf = (path: ReadonlyArray<string>): string => path.join(" / ")

const without = <V>(entries: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> =>
  new Map([...entries].filter(([name]) => name !== key))

const make = Effect.sync(() => {
  const held = Cell.make<ReadonlyMap<string, Held>>(new Map())
  const tree = Cell.make<ReadonlyMap<string, Schema.Json>>(new Map())
  const log = Cell.make<ReadonlyArray<Written>>([])

  const counted = (key: string, cell: Cell.Cell<Schema.Json>, by: number): number => {
    const users = (held.read().get(key)?.users ?? 0) + by

    held.write(new Map([...held.read(), [key, { cell, users }]]))

    return users
  }

  const joined = (key: string, initial: Schema.Json): Cell.Cell<Schema.Json> => {
    const cell = held.read().get(key)?.cell ?? Cell.make(initial)

    counted(key, cell, 1)
    tree.write(new Map([...tree.read(), [key, cell.read()]]))

    return cell
  }

  const left = (key: string, cell: Cell.Cell<Schema.Json>): void => {
    if (counted(key, cell, -1) > 0) return

    held.write(without(held.read(), key))
    tree.write(without(tree.read(), key))
  }

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
        (cell) => Effect.sync(() => left(key, cell)),
      ),
      (cell) => {
        const set = (name: string, next: A) =>
          Effect.sync(() => {
            const value = encode(next)

            cell.write(value)
            tree.write(new Map([...tree.read(), [key, value]]))
            log.write([...log.read(), { seq: log.read().length + 1, key, name, value }])
          })

        return {
          value: map(fromCell(cell), decode),
          set,
          update: (name, change) => Effect.suspend(() => set(name, change(decode(cell.read())))),
        }
      },
    )
  }

  return State.of({ slot, log: fromCell(log), tree: fromCell(tree) })
})

export const layer: Layer.Layer<State> = Layer.effect(State, make)

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
