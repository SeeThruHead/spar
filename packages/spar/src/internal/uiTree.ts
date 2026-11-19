import { Context, Option, Schema } from "effect"
import * as Cell from "./cell.ts"

export type Path = ReadonlyArray<string>

export const Entry = Schema.Struct({
  path: Schema.Array(Schema.String),
  name: Schema.String,
  value: Schema.Json,
})

export type Entry = typeof Entry.Type

export const Snapshot = Schema.Array(Entry)

export type Snapshot = typeof Snapshot.Type

export type Change = Entry & { readonly kind: "added" | "set" | "removed" }

const placeKey = (path: Path): string => path.join("\u0000")

const entryKey = (path: Path, name: string): string => `${placeKey(path)}\u0001${name}`

const numbered = (path: Path, nth: number): Path =>
  nth === 1 ? path : [...path.slice(0, -1), `${path.at(-1)}#${nth}`]

class Kept<A> implements Cell.Cell<A> {
  readonly path: Path
  readonly name: string
  readonly schema: Schema.Codec<A, unknown>
  readonly inner: Cell.Cell<A>
  readonly changed: (kept: Kept<A>) => void

  constructor(
    path: Path,
    name: string,
    schema: Schema.Codec<A, unknown>,
    initial: A,
    changed: (kept: Kept<A>) => void,
  ) {
    this.path = path
    this.name = name
    this.schema = schema
    this.inner = Cell.make(initial)
    this.changed = changed
  }

  read(): A {
    return this.inner.read()
  }

  write(value: A): void {
    if (Object.is(this.inner.read(), value)) return

    this.inner.write(value)
    this.changed(this)
  }

  subscribe(listener: Cell.Listener<A>): Cell.Stop {
    return this.inner.subscribe(listener)
  }

  encoded(): Option.Option<Schema.Json> {
    return Schema.encodeUnknownOption(Schema.toCodecJson(this.schema))(this.inner.read())
  }

  entry(): Option.Option<Entry> {
    return Option.map(this.encoded(), (value) => ({ path: this.path, name: this.name, value }))
  }

  accept(value: Schema.Json): boolean {
    return Option.match(Schema.decodeOption(Schema.toCodecJson(this.schema))(value), {
      onNone: () => false,
      onSome: (decoded) => {
        this.write(decoded)

        return true
      },
    })
  }
}

type AnyKept = {
  readonly path: Path
  readonly name: string
  readonly entry: () => Option.Option<Entry>
  readonly accept: (value: Schema.Json) => boolean
}

type Place = { readonly owner: object; readonly path: Path; readonly keys: Cell.Waiting<string> }

export class Tree {
  readonly places = new Map<object, Place>()
  readonly taken = new Set<string>()
  readonly kept = new Map<string, AnyKept>()
  readonly seeds = new Map<string, Schema.Json>()
  readonly listeners = new Set<(change: Change) => void>()

  free(path: Path, nth: number): Path {
    const candidate = numbered(path, nth)

    return this.taken.has(placeKey(candidate)) ? this.free(path, nth + 1) : candidate
  }

  enter(owner: object, wanted: () => Path): { readonly place: Place; readonly fresh: boolean } {
    const known = this.places.get(owner)
    if (known !== undefined) return { place: known, fresh: false }

    const place: Place = { owner, path: this.free(wanted(), 1), keys: Cell.waiting() }

    this.places.set(owner, place)
    this.taken.add(placeKey(place.path))

    return { place, fresh: true }
  }

  leave(place: Place): void {
    Cell.take(place.keys).forEach((key) => {
      const kept = this.kept.get(key)

      this.kept.delete(key)
      Option.map(Option.fromNullishOr(kept), (gone) => this.tell("removed", gone))
    })
    this.places.delete(place.owner)
    this.taken.delete(placeKey(place.path))
  }

  unused(path: Path, name: string, nth: number): string {
    const candidate = nth === 1 ? name : `${name}#${nth}`

    return this.kept.has(entryKey(path, candidate)) ? this.unused(path, name, nth + 1) : candidate
  }

  hold<A>(
    place: Place,
    wanted: string,
    schema: Schema.Codec<A, unknown>,
    initial: A,
  ): Cell.Cell<A> {
    const name = this.unused(place.path, wanted, 1)
    const key = entryKey(place.path, name)
    const kept = new Kept(place.path, name, schema, initial, (changed) => this.tell("set", changed))
    const seed = this.seeds.get(key)

    this.seeds.delete(key)
    this.kept.set(key, kept)
    Cell.defer(place.keys, key)
    Option.map(Option.fromUndefinedOr(seed), (value) => kept.accept(value))
    this.tell("added", kept)

    return kept
  }

  tell(kind: Change["kind"], kept: AnyKept): void {
    if (this.listeners.size === 0) return

    Option.map(kept.entry(), (entry) =>
      this.listeners.forEach((listener) => listener({ ...entry, kind })),
    )
  }

  snapshot(): Snapshot {
    return [...this.kept.values()].flatMap((kept) => Option.toArray(kept.entry()))
  }

  put(path: Path, name: string, value: Schema.Json): boolean {
    return this.kept.get(entryKey(path, name))?.accept(value) ?? false
  }

  restore(snapshot: Snapshot): void {
    this.seeds.clear()
    snapshot.forEach((entry) => {
      if (this.kept.has(entryKey(entry.path, entry.name))) return

      this.seeds.set(entryKey(entry.path, entry.name), entry.value)
    })
    snapshot.forEach((entry) => this.put(entry.path, entry.name, entry.value))
  }

  subscribe(listener: (change: Change) => void): Cell.Stop {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const UiTree = Context.Reference<Tree>("spar/UiState/Tree", {
  defaultValue: () => new Tree(),
})

export const RowKey = Context.Reference<string | undefined>("spar/internal/RowKey", {
  defaultValue: () => undefined,
})
