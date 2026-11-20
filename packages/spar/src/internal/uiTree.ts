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

type Past<A> = {
  readonly seq: number
  readonly value: A
  readonly depth: number
  readonly before: Past<A> | undefined
}

const newestOf = <A>(past: Past<A> | undefined, count: number): ReadonlyArray<Past<A>> =>
  past === undefined || count === 0 ? [] : [past, ...newestOf(past.before, count - 1)]

const rebuilt = <A>(nodes: ReadonlyArray<Past<A>>): Past<A> | undefined =>
  nodes.reduceRight<Past<A> | undefined>(
    (before, node) => ({ ...node, depth: (before?.depth ?? 0) + 1, before }),
    undefined,
  )

const reached = <A>(past: Past<A> | undefined, seq: number): Past<A> | undefined => {
  if (past === undefined) return undefined
  if (past.seq <= seq) return past

  return reached(past.before, seq)
}

export class Kept<A> implements Cell.Cell<A> {
  readonly path: Path
  readonly name: string
  readonly schema: Schema.Codec<A, unknown>
  readonly inner: Cell.Cell<A>
  readonly tree: Tree
  readonly first: Cell.Cell<A>
  readonly live: Cell.Cell<A>
  readonly past = Cell.make<Past<A> | undefined>(undefined)

  constructor(path: Path, name: string, schema: Schema.Codec<A, unknown>, initial: A, tree: Tree) {
    this.path = path
    this.name = name
    this.schema = schema
    this.inner = Cell.make(initial)
    this.first = Cell.make(initial)
    this.live = Cell.make(initial)
    this.tree = tree
  }

  settled(): void {
    this.first.write(this.inner.read())
  }

  remembered(seq: number, value: A): void {
    const limit = this.tree.keeping.read()
    const before = this.past.read()
    const next = { seq, value, depth: (before?.depth ?? 0) + 1, before }
    if (next.depth <= limit * 2) return this.past.write(next)

    const kept = newestOf(next, limit)

    Option.map(Option.fromNullishOr(kept.at(-1)?.before), (dropped) =>
      this.first.write(dropped.value),
    )
    this.past.write(rebuilt(kept))
  }

  showAt(seq: number): void {
    this.display(reached(this.past.read(), seq)?.value ?? this.first.read())
  }

  forkAt(seq: number): void {
    this.past.write(reached(this.past.read(), seq))
    this.live.write(this.past.read()?.value ?? this.first.read())
  }

  read(): A {
    return this.inner.read()
  }

  current(): A {
    return this.live.read()
  }

  saved(): () => void {
    const past = this.past.read()
    const live = this.live.read()

    return () => {
      this.past.write(past)
      this.write(live)
    }
  }

  write(value: A): void {
    this.live.write(value)
    this.display(value)
  }

  display(value: A): void {
    if (Object.is(this.inner.read(), value)) return

    this.inner.write(value)
    this.tree.tell("set", this)
  }

  writtenAs(name: string, value: A, about: About): void {
    this.tree.written(this, name, value, about)
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
  readonly encoded: () => Option.Option<Schema.Json>
  readonly accept: (value: Schema.Json) => boolean
  readonly settled: () => void
  readonly showAt: (seq: number) => void
  readonly forkAt: (seq: number) => void
}

const logLimit = 1000

export type Trace = { readonly traceId: string; readonly spanId: string }

export type About = Trace & { readonly payload?: Schema.Json }

export type Written = Trace & {
  readonly seq: number
  readonly path: Path
  readonly slot: string
  readonly name: string
  readonly payload?: Schema.Json
}
type Place = { readonly owner: object; readonly path: Path; readonly keys: Cell.Waiting<string> }

export class Tree {
  readonly places = new Map<object, Place>()
  readonly taken = new Set<string>()
  readonly kept = new Map<string, AnyKept>()
  readonly seeds = new Map<string, Schema.Json>()
  readonly listeners = new Set<(change: Change) => void>()
  readonly log = Cell.make<ReadonlyArray<Written>>([])
  readonly viewing = Cell.make<number | null>(null)
  readonly seq = Cell.make(0)
  readonly keeping = Cell.make(0)

  keepAtLeast(count: number): void {
    this.keeping.write(Math.max(this.keeping.read(), count))
  }

  written<A>(kept: Kept<A>, name: string, value: A, about: About): void {
    if (this.viewing.read() !== null) this.travelTo(null)

    const seq = this.seq.read() + 1

    this.seq.write(seq)
    kept.write(value)
    if (this.keeping.read() === 0) return

    kept.remembered(seq, value)
    this.log.write(
      [...this.log.read(), { seq, path: kept.path, slot: kept.name, name, ...about }].slice(
        -logLimit,
      ),
    )
  }

  root(): Place {
    const { place } = this.enter(this, () => [])

    this.taken.delete(placeKey(place.path))

    return place
  }

  release(kept: AnyKept): void {
    this.kept.delete(entryKey(kept.path, kept.name))
    this.tell("removed", kept)
  }

  travelTo(seq: number | null): void {
    this.viewing.write(seq)
    Array.from(this.kept.values()).forEach((kept) => kept.showAt(seq ?? Number.POSITIVE_INFINITY))
  }

  fork(): void {
    const at = this.viewing.read()
    if (at === null) return

    Array.from(this.kept.values()).forEach((kept) => kept.forkAt(at))
    this.log.write(this.log.read().filter((entry) => entry.seq <= at))
    this.seq.write(at)
    this.viewing.write(null)
  }

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

  hold<A>(place: Place, wanted: string, schema: Schema.Codec<A, unknown>, initial: A): Kept<A> {
    const name = this.unused(place.path, wanted, 1)
    const key = entryKey(place.path, name)
    const kept = new Kept(place.path, name, schema, initial, this)
    const seed = this.seeds.get(key)

    this.seeds.delete(key)
    this.kept.set(key, kept)
    Cell.defer(place.keys, key)
    Option.map(Option.fromUndefinedOr(seed), (value) => kept.accept(value))
    kept.settled()
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

  uiSnapshot(): Snapshot {
    return this.snapshot().filter((entry) => entry.path.length > 0)
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
