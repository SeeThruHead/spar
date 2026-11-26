import { Context, Effect, Layer, Option, Schema, Scope, Stream } from "effect"
import { KeyValueStore } from "effect/persistence"
import * as Tabs from "./Tabs.ts"
import * as Cell from "./internal/cell.ts"
import { fromCell } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import { Tree as UiTreeClass, UiTree } from "./internal/uiTree.ts"
import type { Kept, Snapshot, Tree, Written } from "./internal/uiTree.ts"
import { fromAnotherTab, restoredFromStorage, writeTo } from "./internal/written.ts"

export type { Snapshot, Written } from "./internal/uiTree.ts"

export type Slot<A> = {
  readonly name: string
  readonly value: Reactive<A>
  readonly pick: <B>(part: (value: A) => B) => Reactive<B>
  readonly set: (name: string, next: A, payload?: Schema.Json) => Effect.Effect<void>
  readonly update: (
    name: string,
    change: (now: A) => A,
    payload?: Schema.Json,
  ) => Effect.Effect<void>
  readonly showAt: (seq: number | null) => Effect.Effect<void>
  readonly valueAt: (seq: number) => Effect.Effect<A>
  readonly show: (value: A) => Effect.Effect<void>
  readonly forkAt: (seq: number) => Effect.Effect<void>
  readonly hold: Effect.Effect<Effect.Effect<void>>
}

export type Service = {
  readonly slot: <A, I>(
    path: ReadonlyArray<string>,
    schema: Schema.Codec<A, I>,
    initial: A,
    savedAs?: string,
  ) => Effect.Effect<Slot<A>, never, Scope.Scope>
  readonly log: Reactive<ReadonlyArray<Written>>
  readonly viewing: Reactive<number | null>
  readonly snapshot: Effect.Effect<Snapshot>
  readonly travelTo: (seq: number | null) => Effect.Effect<void>
  readonly fork: Effect.Effect<void>
}

const Saving = Context.Reference<Option.Option<KeyValueStore.KeyValueStore>>("spar/State/Saving", {
  defaultValue: Option.none,
})

const storedKey = (path: ReadonlyArray<string>, savedAs: string | undefined): string =>
  savedAs ?? `spar/state/${path.join(" / ")}`

const savedValue = <A, I>(
  saving: Option.Option<KeyValueStore.KeyValueStore>,
  key: string,
  schema: Schema.Codec<A, I>,
): Effect.Effect<Option.Option<A>> =>
  Option.match(saving, {
    onNone: () => Effect.succeedNone,
    onSome: (store) =>
      Effect.map(Effect.orDie(store.get(key)), (kept) =>
        Option.flatMap(
          Option.fromUndefinedOr(kept),
          Schema.decodeUnknownOption(Schema.fromJsonString(Schema.toCodecJson(schema))),
        ),
      ),
  })

const replacedBy = <A, I>(
  kept: Kept<A>,
  schema: Schema.Codec<A, I>,
  name: string,
  value: A,
): Effect.Effect<void> =>
  Effect.flatMap(Effect.orDie(Schema.encodeEffect(Schema.toCodecJson(schema))(value)), (payload) =>
    writeTo(kept, name, value, payload),
  )

const writtenAndSaved = <A, I>(
  saving: Option.Option<KeyValueStore.KeyValueStore>,
  tabs: Tabs.Tabs,
  key: string,
  schema: Schema.Codec<A, I>,
  kept: Kept<A>,
  name: string,
  next: (now: A) => A,
  payload?: Schema.Json,
): Effect.Effect<void> =>
  Option.match(saving, {
    onNone: () => Effect.suspend(() => writeTo(kept, name, next(kept.current()), payload)),
    onSome: (store) =>
      Effect.andThen(
        Effect.suspend(() => {
          const value = next(kept.current())

          return Effect.andThen(
            writeTo(kept, name, value, payload),
            Effect.flatMap(
              Effect.orDie(
                Schema.encodeEffect(Schema.fromJsonString(Schema.toCodecJson(schema)))(value),
              ),
              (text) => Effect.orDie(store.set(key, text)),
            ),
          )
        }),
        tabs.announce(key),
      ),
  })

const followOtherTabs = <A, I>(
  saving: Option.Option<KeyValueStore.KeyValueStore>,
  tabs: Tabs.Tabs,
  key: string,
  schema: Schema.Codec<A, I>,
  kept: Kept<A>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.forEach(Option.toArray(saving), () =>
    Effect.forkScoped(
      Stream.runForEach(tabs.announced(key), () =>
        Effect.flatMap(savedValue(saving, key, schema), (found) =>
          Effect.forEach(
            Option.toArray(found),
            (now) => replacedBy(kept, schema, fromAnotherTab, now),
            { discard: true },
          ),
        ),
      ),
      { startImmediately: true },
    ),
  ).pipe(Effect.asVoid)

const slotIn = (tree: Tree) =>
  Effect.fnUntraced(function* <A, I>(
    path: ReadonlyArray<string>,
    schema: Schema.Codec<A, I>,
    initial: A,
    savedAs?: string,
  ): Effect.fn.Return<Slot<A>, never, Scope.Scope> {
    const saving = yield* Saving
    const tabs = yield* Tabs.Tabs
    const key = storedKey(path, savedAs)
    const saved = yield* savedValue(saving, key, schema)
    const kept = yield* Effect.acquireRelease(
      Effect.sync(() => tree.hold(tree.root(), path.join(" / "), schema, initial)),
      (held) => Effect.sync(() => tree.release(held)),
    )
    const written = (name: string, next: (now: A) => A, payload?: Schema.Json) =>
      writtenAndSaved(saving, tabs, key, schema, kept, name, next, payload)

    yield* Effect.forEach(
      Option.toArray(saved),
      (value) => replacedBy(kept, schema, restoredFromStorage, value),
      { discard: true },
    )
    yield* followOtherTabs(saving, tabs, key, schema, kept)

    return {
      name: kept.name,
      value: fromCell(kept),
      pick: (part) => {
        const held = Cell.make(part(kept.read()))

        kept.subscribe((now) => held.write(part(now)))

        return fromCell(held)
      },
      set: (name, next, payload) => written(name, () => next, payload),
      update: (name, change, payload) => written(name, change, payload),
      showAt: (seq) => Effect.sync(() => kept.showAt(seq ?? Number.POSITIVE_INFINITY)),
      valueAt: (seq) => Effect.sync(() => kept.valueAt(seq)),
      show: (value) => Effect.sync(() => kept.display(value)),
      forkAt: (seq) => Effect.sync(() => kept.forkAt(seq)),
      hold: Effect.sync(() => Effect.sync(kept.saved())),
    }
  })

const serviceOf = (tree: Tree): Service => ({
  slot: slotIn(tree),
  log: fromCell(tree.log),
  viewing: fromCell(tree.viewing),
  snapshot: Effect.sync(() => tree.snapshot()),
  travelTo: (seq) => Effect.sync(() => tree.travelTo(seq)),
  fork: Effect.sync(() => tree.fork()),
})

export const current: Effect.Effect<Service> = Effect.map(Effect.service(UiTree), serviceOf)

export const Tag =
  <Self>() =>
  <const Key extends string, A, I>(key: Key, schema: Schema.Codec<A, I>, initial: NoInfer<A>) => {
    const service = Context.Service<Self, Slot<A>>()(key)

    return class extends service {
      static readonly layer = Layer.effect(
        service,
        Effect.flatMap(current, (state) => state.slot([key], schema, initial)),
      )
    }
  }

export const saved = Layer.effect(
  Saving,
  Effect.asSome(Effect.service(KeyValueStore.KeyValueStore)),
)

export const layer = Layer.sync(UiTree, () => new UiTreeClass())
