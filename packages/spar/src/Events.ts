import { Context, Effect, Function } from "effect"
import { Stream } from "effect"
import type { Scope } from "effect"
import { modify } from "./internal/action.ts"
import type { Action, Handler, Modified } from "./internal/action.ts"
import { events, listen, on } from "./internal/listen.ts"
import type { Source } from "./internal/listen.ts"
import { ViewScope } from "./internal/viewScope.ts"
import { OnServer } from "./internal/server.ts"
import { fromStream, succeed } from "./Reactive.ts"
import type { Reactive } from "./Reactive.ts"

const onServer = Effect.map(Effect.context(), (context) => Context.get(context, OnServer))

const inBrowser = <A, R>(
  there: Effect.Effect<A, never, R>,
  otherwise: A,
): Effect.Effect<A, never, R> =>
  Effect.flatMap(onServer, (server) => (server ? Effect.succeed(otherwise) : there))

const streamInBrowser = <A>(there: Stream.Stream<A>): Stream.Stream<A> =>
  Stream.unwrap(Effect.map(onServer, (server) => (server ? Stream.empty : there)))

export const prevent = <Event>(handler: Handler<Event>): Modified<Event> =>
  modify("preventDefault", handler)

export const stop = <Event>(handler: Handler<Event>): Modified<Event> =>
  modify("stopPropagation", handler)

export const cancel = (event: { readonly preventDefault: () => void }): Action =>
  Effect.sync(() => event.preventDefault())

export const onWindow = <Type extends keyof WindowEventMap>(
  type: Type,
  handler: Handler<WindowEventMap[Type]>,
): Effect.Effect<void, never, Scope.Scope | ViewScope> =>
  ViewScope.use(() => inBrowser(listen(window, type, handler), undefined))

export const onDocument = <Type extends keyof DocumentEventMap>(
  type: Type,
  handler: Handler<DocumentEventMap[Type]>,
): Effect.Effect<void, never, Scope.Scope | ViewScope> =>
  ViewScope.use(() => inBrowser(listen(document, type, handler), undefined))

export const fromWindow = <Type extends keyof WindowEventMap>(
  type: Type,
): Stream.Stream<WindowEventMap[Type]> =>
  streamInBrowser(
    events(
      {
        add: (listener: (event: WindowEventMap[Type]) => void) =>
          window.addEventListener(type, listener),
        remove: (listener) => window.removeEventListener(type, listener),
      },
      Function.identity,
    ),
  )

export const fromDocument = <Type extends keyof DocumentEventMap>(
  type: Type,
): Stream.Stream<DocumentEventMap[Type]> =>
  streamInBrowser(
    events(
      {
        add: (listener: (event: DocumentEventMap[Type]) => void) =>
          document.addEventListener(type, listener),
        remove: (listener) => document.removeEventListener(type, listener),
      },
      Function.identity,
    ),
  )

export const mediaQuery = (query: string): Effect.Effect<Reactive<boolean>, never, Scope.Scope> =>
  inBrowser(
    Effect.suspend(() => {
      const list = window.matchMedia(query)

      return fromStream(
        list.matches,
        events(on(list, "change"), () => list.matches),
      )
    }),
    succeed(false),
  )

const connection: Source<Event> = {
  add: (listener) => ["online", "offline"].forEach((type) => on(window, type).add(listener)),
  remove: (listener) => ["online", "offline"].forEach((type) => on(window, type).remove(listener)),
}

export const online: Effect.Effect<Reactive<boolean>, never, Scope.Scope> = inBrowser(
  Effect.suspend(() =>
    fromStream(
      navigator.onLine,
      events(connection, (event) => event.type === "online"),
    ),
  ),
  succeed(true),
)

export const visible: Effect.Effect<Reactive<boolean>, never, Scope.Scope> = inBrowser(
  Effect.suspend(() =>
    fromStream(
      document.visibilityState === "visible",
      events(on(document, "visibilitychange"), () => document.visibilityState === "visible"),
    ),
  ),
  succeed(true),
)
