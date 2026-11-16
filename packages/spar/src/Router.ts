import { Array, Context, Effect, Layer, Option, Ref, Schema, Stream, SubscriptionRef } from "effect"
import type { Scope } from "effect"
import * as Handle from "./Handle.ts"
import { modify } from "./internal/action.ts"
import type { Modified } from "./internal/action.ts"
import { inContext } from "./internal/context.ts"
import * as Dom from "./internal/dom.ts"
import { keyed } from "./internal/element.ts"
import type { Element } from "./internal/element.ts"
import { events, on as onTarget } from "./internal/listen.ts"
import { fromSubscriptionRef, map } from "./internal/reactive.ts"
import type { Reactive } from "./internal/reactive.ts"
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
}

export type Route<Params> = {
  readonly [TypeId]: typeof TypeId
  readonly pattern: string
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
}

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

const make = <Params, Encoded extends Raw>(
  pattern: string,
  schema: Schema.Codec<Params, Encoded>,
): Route<Params> => {
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

export const route: {
  <const Path extends string>(path: Path): Route<PathParams<Path>>
  <Params, Encoded extends Raw>(path: string, schema: Schema.Codec<Params, Encoded>): Route<Params>
} = <Params, Encoded extends Raw>(
  path: string,
  schema?: Schema.Codec<Params, Encoded>,
): Route<Params> | Route<Readonly<Record<string, string>>> =>
  schema === undefined ? make(path, strings) : make(path, schema)

const locate = (url: string): Location => {
  const parsed = new URL(url, "http://spar.invalid")

  return { pathname: parsed.pathname, search: parsed.search }
}

type Driver = {
  readonly read: Effect.Effect<Location>
  readonly moved: Stream.Stream<Location>
  readonly visit: (url: string) => Effect.Effect<void>
  readonly replace: (url: string) => Effect.Effect<void>
  readonly back: Effect.Effect<void>
}

const fromDriver = Effect.fnUntraced(function* (driver: Driver) {
  const start = yield* driver.read
  const location = yield* SubscriptionRef.make(start)
  const follow = Effect.flatMap(driver.read, (now) => SubscriptionRef.set(location, now))

  yield* Effect.forkScoped(
    Stream.runForEach(driver.moved, (now) => SubscriptionRef.set(location, now)),
    { startImmediately: true },
  )

  const go = <Params>(target: Route<Params>, params: Params): Effect.Effect<void> =>
    Effect.andThen(driver.visit(target.build(params)), follow)

  return {
    location: fromSubscriptionRef(location),
    go,
    replace: <Params>(target: Route<Params>, params: Params): Effect.Effect<void> =>
      Effect.andThen(driver.replace(target.build(params)), follow),
    back: Effect.andThen(driver.back, follow),
    link: <Params>(target: Route<Params>, params: Params): Link => ({
      href: target.build(params),
      onClick: modify("followLink", go(target, params)),
    }),
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
  }))

const readWindow = (): Location => ({
  pathname: window.location.pathname,
  search: window.location.search,
})

const inBrowser: Driver = {
  read: Effect.sync(readWindow),
  moved: Stream.suspend(() => events(onTarget(window, "popstate"), readWindow)),
  visit: (url) =>
    Effect.sync(() => {
      window.history.pushState(null, "", url)
      Dom.scrollToTop()
    }),
  replace: (url) => Effect.sync(() => window.history.replaceState(null, "", url)),
  back: Effect.sync(() => window.history.back()),
}

export class Router extends Context.Service<
  Router,
  {
    readonly location: Reactive<Location>
    readonly go: <Params>(target: Route<Params>, params: Params) => Effect.Effect<void>
    readonly replace: <Params>(target: Route<Params>, params: Params) => Effect.Effect<void>
    readonly back: Effect.Effect<void>
    readonly link: <Params>(target: Route<Params>, params: Params) => Link
  }
>()("spar/Router") {
  static readonly layerMemory = (initial: string) =>
    Layer.effect(Router, Effect.flatMap(inMemory(initial), fromDriver))

  static readonly layerBrowser = Layer.effect(Router, fromDriver(inBrowser))
}

export type Case<R> = {
  readonly match: (location: Location) => Option.Option<{
    readonly key: string
    readonly mount: Effect.Effect<Element, never, R | Scope.Scope>
  }>
}

export const on = <Params, R = never>(
  target: Route<Params>,
  component: Mountable<Params, never, R>,
): Case<R> => ({
  match: (location) =>
    Option.map(target.parse(location), ({ params, key }) => ({
      key,
      mount: child(component, params),
    })),
})

type Page = {
  readonly key: string
  readonly mount: Effect.Effect<Element, never, Scope.Scope>
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
          mount: inContext(child(options.otherwise, { path: location.pathname }), context),
        }),
        onSome: ({ key, mount }) => ({
          key,
          mount: inContext(mount, context),
        }),
      },
    )

  return keyed({
    kind: "mounted",
    items: map(router.location, (location) => [page(location)]),
    key: (shown: Page) => shown.key,
    mount: (_key, shown) => Effect.flatMap(shown.get, (now) => now.mount),
  })
})

export const focusOnChange = Effect.fnUntraced(function* (handle: Handle.Handle) {
  const router = yield* Router

  yield* Effect.forkScoped(
    Stream.runForEach(Stream.drop(router.location.changes, 1), () => Handle.focus(handle)),
    { startImmediately: true },
  )
})
