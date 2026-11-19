import {
  Array,
  Context,
  Effect,
  Function,
  Layer,
  Option,
  Predicate,
  Ref,
  Schedule,
  Schema,
  Stream,
} from "effect"
import type { Scope } from "effect"
import * as Handle from "./Handle.ts"
import { modify } from "./internal/action.ts"
import type { Modified } from "./internal/action.ts"
import { inContext } from "./internal/context.ts"
import * as Dom from "./internal/dom.ts"
import { keyed } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { events, on as onTarget } from "./internal/listen.ts"
import * as Cell from "./internal/cell.ts"
import { Preload } from "./internal/preload.ts"
import { fromCell, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
import * as Props from "./Props.ts"
import * as Timeline from "./Timeline.ts"
import { child } from "./View.ts"
import type { Mountable } from "./View.ts"

const TypeId = "~spar/Route"

export type Location = {
  readonly pathname: string
  readonly search: string
}

type Raw = Readonly<Record<string, string | undefined>>

type Matched<Params> = {
  readonly params: Params
  readonly key: string
  readonly place: string
}

export type Route<Params, Path extends string = string> = {
  readonly [TypeId]: typeof TypeId
  readonly pattern: string
  readonly path?: Path
  readonly parse: (location: Location) => Option.Option<Matched<Params>>
  readonly build: (params: Params) => string
}

type Segments<Path extends string> = Path extends `${infer Head}/${infer Rest}`
  ? Head | Segments<Rest>
  : Path

type ParamNames<Path extends string> =
  Segments<Path> extends infer Segment ? (Segment extends `:${infer Name}` ? Name : never) : never

export type PathParams<Path extends string> = { readonly [Name in ParamNames<Path>]: string }

export type Link = {
  readonly href: string
  readonly onClick: Modified<MouseEvent>
  readonly onIntent: Effect.Effect<void>
}

const isLink = (value: unknown): value is Link =>
  Predicate.hasProperty(value, "href") && Predicate.hasProperty(value, "onClick")

export const Link: Schema.declare<Link> = Props.kind(isLink, (value) =>
  Option.map(Option.liftPredicate(value, isLink), (link) => link.href),
)

const isParam = (segment: string): boolean => segment.startsWith(":")

const segmentsOf = (path: string): ReadonlyArray<string> =>
  path.split("/").filter((segment) => segment.length > 0)

const openEnd = /\/\*$/

const decoded = Option.liftThrowable(decodeURIComponent)

const encodeSegment = (text: string): string => encodeURIComponent(text.toWellFormed())

const bind = (
  pattern: ReadonlyArray<string>,
  actual: ReadonlyArray<string>,
  open: boolean,
): Option.Option<ReadonlyArray<readonly [string, string]>> => {
  if (actual.length < pattern.length) return Option.none()
  if (!open && actual.length !== pattern.length) return Option.none()

  const pairs = Array.zip(pattern, actual)
  if (!pairs.every(([expected, found]) => isParam(expected) || expected === found)) {
    return Option.none()
  }

  return Option.all(
    pairs
      .filter(([expected]) => isParam(expected))
      .map(([name, value]) => Option.map(decoded(value), (text) => [name.slice(1), text] as const)),
  )
}

const strings = Schema.Record(Schema.String, Schema.String)

const make = <Params, Encoded extends Raw, Path extends string = string>(
  pattern: string,
  schema: Schema.Codec<Params, Encoded>,
): Route<Params, Path> => {
  const expected = segmentsOf(pattern.replace(openEnd, ""))
  const open = openEnd.test(pattern)
  const inPath = new Set(expected.filter(isParam).map((name) => name.slice(1)))
  const decode = Schema.decodeUnknownOption(schema)
  const encode = Schema.encodeSync(schema)

  const parse = (location: Location): Option.Option<Matched<Params>> =>
    Option.flatMap(bind(expected, segmentsOf(location.pathname), open), (bound) => {
      const fromPath = Object.fromEntries(bound)
      const raw = open
        ? fromPath
        : { ...Object.fromEntries(new URLSearchParams(location.search)), ...fromPath }

      return Option.map(decode(raw), (params) => ({
        params,
        key: `${pattern} ${new URLSearchParams(raw).toString()}`,
        place: `${pattern} ${new URLSearchParams(fromPath).toString()}`,
      }))
    })

  const build = (params: Params): string => {
    const raw: Raw = encode(params)
    const path = expected.flatMap((segment) =>
      isParam(segment)
        ? Option.toArray(Option.fromNullishOr(raw[segment.slice(1)])).map(encodeSegment)
        : [segment],
    )
    const query = new URLSearchParams(
      Object.entries(raw).flatMap(([name, value]) =>
        inPath.has(name)
          ? []
          : Option.toArray(Option.fromNullishOr(value)).map((text) => [name, text]),
      ),
    ).toString()

    return [`/${path.join("/")}`, ...Array.filter([query], (text) => text.length > 0)].join("?")
  }

  return { [TypeId]: TypeId, pattern, parse, build }
}

type Paramless<Path extends string> = [ParamNames<Path>] extends [never] ? Path : never

export const route: {
  <const Path extends string>(path: Paramless<Path>): Route<PathParams<Path>, Path>
  <const Path extends string, Params, Encoded extends Raw & PathParams<Path>>(
    path: Path,
    schema: Schema.Codec<Params, Encoded>,
  ): Route<Params, Path>
} = <Params, Encoded extends Raw>(
  path: string,
  schema?: Schema.Codec<Params, Encoded>,
): Route<Params> | Route<Readonly<Record<string, string>>> =>
  schema === undefined ? make(path, strings) : make(path, schema)

type Under<Parent extends string, Sub extends string> = Parent extends `${infer Head}/*`
  ? `${Head}${Sub}`
  : never

type InsideOpen<Parent extends string, Sub extends string> = Parent extends `${string}/*`
  ? Sub
  : "SPAR_ROUTE_UNDER_CLOSED: the parent route must end with /* to have routes under it"

export const under = <
  ParentParams,
  const Parent extends string,
  const Sub extends `/${string}`,
  Params,
  Encoded extends Raw & PathParams<Under<Parent, Sub>>,
>(
  parent: Route<ParentParams, Parent>,
  path: InsideOpen<Parent, Sub>,
  schema: Schema.Codec<Params, Encoded>,
): Route<Params, Under<Parent, Sub>> =>
  make(`${parent.pattern.replace(openEnd, "")}${path}`, schema)

const locate = (url: string): Location => {
  const parsed = new URL(url, "http://spar.invalid")

  return { pathname: parsed.pathname, search: parsed.search }
}

const preload = (url: string): Effect.Effect<void> =>
  Effect.flatMap(Effect.service(Preload), (rehearse) => rehearse(url))

export type Arrival = "link" | "history"

type Driver = {
  readonly read: Effect.Effect<Location>
  readonly moved: Stream.Stream<Location>
  readonly visit: (url: string) => Effect.Effect<void>
  readonly replace: (url: string) => Effect.Effect<void>
  readonly back: Effect.Effect<void>
  readonly arrive: Effect.Effect<void>
}

const named =
  (name: string) =>
  <A>(effect: Effect.Effect<A>): Effect.Effect<A> =>
    Effect.withSpan(effect, `Router.${name}`, { captureStackTrace: false })

const fromDriver = Effect.fnUntraced(function* (driver: Driver) {
  const start = yield* driver.read
  const location = Cell.make(start)
  const arrivedBy = Cell.make<Arrival>("link")
  const arrive = (now: Location, by: Arrival) =>
    Effect.andThen(
      Effect.sync(() => location.write(now)),
      Timeline.note("route", `${now.pathname}${now.search}`, () => by),
    )
  const followBy = (by: Arrival) =>
    Effect.andThen(
      Effect.sync(() => arrivedBy.write(by)),
      Effect.flatMap(driver.read, (now) => arrive(now, by)),
    )
  const follow = followBy("link")

  yield* Effect.forkScoped(
    Stream.runForEach(driver.moved, (now) =>
      Effect.sync(() => arrivedBy.write("history")).pipe(
        Effect.andThen(arrive(now, "history")),
        (arrived) =>
          Effect.withSpan(arrived, "Router.popstate", {
            captureStackTrace: false,
            root: true,
            attributes: { "spar.url": `${now.pathname}${now.search}` },
          }),
        Effect.andThen(Effect.forkScoped(driver.arrive)),
      ),
    ),
    { startImmediately: true },
  )

  const go = <Params>(target: Route<Params>, params: Params): Effect.Effect<void> =>
    Effect.andThen(driver.visit(target.build(params)), follow).pipe(named("go"))

  return {
    location: fromCell(location),
    arrivedBy: fromCell(arrivedBy),
    go,
    replace: <Params>(target: Route<Params>, params: Params): Effect.Effect<void> =>
      Effect.andThen(driver.replace(target.build(params)), follow).pipe(named("replace")),
    back: Effect.andThen(driver.back, followBy("history")).pipe(named("back")),
    link: <Params>(target: Route<Params>, params: Params): Link => ({
      href: target.build(params),
      onClick: modify("followLink", go(target, params)),
      onIntent: preload(target.build(params)),
    }),
    preload: <Params>(target: Route<Params>, params: Params) => preload(target.build(params)),
  }
})

type Visits = {
  readonly earlier: ReadonlyArray<string>
  readonly current: string
}

const stepBack = (visits: Visits): Visits =>
  Option.match(Array.last(visits.earlier), {
    onNone: () => visits,
    onSome: (previous) => ({ earlier: visits.earlier.slice(0, -1), current: previous }),
  })

const inMemory = (initial: string): Effect.Effect<Driver> =>
  Effect.map(Ref.make<Visits>({ earlier: [], current: initial }), (visits) => ({
    read: Effect.map(Ref.get(visits), ({ current }) => locate(current)),
    moved: Stream.empty,
    visit: (url) =>
      Ref.update(visits, ({ earlier, current }) => ({
        earlier: [...earlier, current],
        current: url,
      })),
    replace: (url) => Ref.update(visits, ({ earlier }) => ({ earlier, current: url })),
    back: Ref.update(visits, stepBack),
    arrive: Effect.void,
  }))

const readWindow = (): Location => ({
  pathname: window.location.pathname,
  search: window.location.search,
})

class NotThereYet extends Schema.TaggedError<NotThereYet, { readonly brand: unique symbol }>()(
  "NotThereYet",
  {},
) {}

const scrollBack = Effect.sync(Dom.restoreScroll).pipe(
  Effect.filterOrFail(Function.identity, () => new NotThereYet()),
  Effect.retry({ times: 40, schedule: Schedule.spaced("50 millis") }),
  Effect.ignore,
)

const inBrowser: Effect.Effect<Driver, never, Scope.Scope> = Effect.gen(function* () {
  yield* Effect.acquireRelease(Effect.sync(Dom.scrollByHand), (undo) => Effect.sync(undo))

  const entry = yield* Ref.make(Dom.historyEntry())
  const leave = Effect.flatMap(Ref.get(entry), (current) =>
    Effect.sync(() => Dom.rememberScroll(current)),
  )

  return {
    read: Effect.sync(readWindow),
    moved: Stream.suspend(() =>
      Stream.mapEffect(events(onTarget(window, "popstate"), readWindow), (now) =>
        leave.pipe(Effect.andThen(Ref.set(entry, Dom.historyEntry())), Effect.as(now)),
      ),
    ),
    visit: (url) =>
      leave.pipe(
        Effect.andThen(Effect.sync(() => Dom.pushEntry(url))),
        Effect.andThen(Effect.suspend(() => Ref.set(entry, Dom.historyEntry()))),
      ),
    replace: (url) => Effect.sync(() => Dom.replaceEntry(url)),
    back: Effect.sync(() => window.history.back()),
    arrive: scrollBack,
  }
})

export class Router extends Context.Service<
  Router,
  {
    readonly location: Reactive<Location>
    readonly arrivedBy: Reactive<Arrival>
    readonly go: <Params>(target: Route<Params>, params: Params) => Effect.Effect<void>
    readonly replace: <Params>(target: Route<Params>, params: Params) => Effect.Effect<void>
    readonly back: Effect.Effect<void>
    readonly link: <Params>(target: Route<Params>, params: Params) => Link
    readonly preload: <Params>(target: Route<Params>, params: Params) => Effect.Effect<void>
  }
>()("spar/Router") {
  static readonly layerMemory = (initial: string) =>
    Layer.effect(Router, Effect.flatMap(inMemory(initial), fromDriver))

  static readonly layerBrowser = Layer.effect(Router, Effect.flatMap(inBrowser, fromDriver))
}

export type Case<R> = {
  readonly match: (location: Location) => Option.Option<{
    readonly key: string
    readonly mount: (now: Reactive<Location>) => Effect.Effect<Element, never, R | Scope.Scope>
  }>
}

export const on = <Params, R = never>(
  target: Route<Params>,
  component: Mountable<Params, never, R>,
): Case<R> => ({
  match: (location) =>
    Option.map(target.parse(location), ({ params, key }) => ({
      key,
      mount: () => child(component, params),
    })),
})

export const live = <Params, R = never>(
  target: Route<Params>,
  component: Mountable<{ readonly params: Reactive<Params> }, never, R>,
): Case<R> => ({
  match: (location) =>
    Option.map(target.parse(location), ({ place }) => ({
      key: place,
      mount: (now) =>
        child(component, {
          params: map(now, (latest) => Option.getOrThrow(target.parse(latest)).params),
        }),
    })),
})

type Page = {
  readonly key: string
  readonly location: Location
  readonly mount: (now: Reactive<Location>) => Effect.Effect<Element, never, Scope.Scope>
}

export const outlet = Effect.fnUntraced(function* <
  const Needs extends ReadonlyArray<unknown>,
  R2 = never,
>(options: {
  readonly routes: { readonly [Index in keyof Needs]: Case<Needs[Index]> }
  readonly otherwise: Mountable<{ readonly path: string }, never, R2>
}) {
  const router = yield* Router
  const context = yield* Effect.context<Needs[number] | R2>()
  const routes: ReadonlyArray<Case<Needs[number]>> = options.routes

  const page = (location: Location): Page =>
    Option.match(
      Array.findFirst(routes, (candidate) => candidate.match(location)),
      {
        onNone: () => ({
          key: `nothing at ${location.pathname}`,
          location,
          mount: () => inContext(child(options.otherwise, { path: location.pathname }), context),
        }),
        onSome: ({ key, mount }) => ({
          key,
          location,
          mount: (now) => inContext(mount(now), context),
        }),
      },
    )

  return keyed({
    kind: "mounted",
    items: map(router.location, (location) => [page(location)]),
    key: (shown: Page) => shown.key,
    mount: (_key, shown) =>
      Effect.flatMap(shown.get, (now) => now.mount(map(shown, (latest) => latest.location))),
  })
})

export const focusOnChange = Effect.fnUntraced(function* (handle: Handle.Handle) {
  const router = yield* Router

  yield* Effect.forkScoped(
    Stream.runForEach(Stream.drop(router.location.changes, 1), () =>
      Effect.flatMap(router.arrivedBy.get, (by) =>
        by === "history" ? Handle.focusInPlace(handle) : Handle.focus(handle),
      ),
    ),
    { startImmediately: true },
  )
})
