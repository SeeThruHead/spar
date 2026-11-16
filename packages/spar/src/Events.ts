import { Effect, Function } from "effect"
import type { Scope, Stream } from "effect"
import { modify } from "./internal/action.ts"
import type { Handler, Modified } from "./internal/action.ts"
import { events, listen, on } from "./internal/listen.ts"
import type { Source } from "./internal/listen.ts"
import { ViewScope } from "./internal/viewScope.ts"
import { fromStream } from "./Reactive.ts"
import type { Reactive } from "./Reactive.ts"

export const prevent = <Event>(handler: Handler<Event>): Modified<Event> =>
  modify("preventDefault", handler)

export const stop = <Event>(handler: Handler<Event>): Modified<Event> =>
  modify("stopPropagation", handler)

export const onWindow = <Type extends keyof WindowEventMap>(
  type: Type,
  handler: Handler<WindowEventMap[Type]>,
): Effect.Effect<void, never, Scope.Scope | ViewScope> =>
  ViewScope.use(() => listen(window, type, handler))

export const onDocument = <Type extends keyof DocumentEventMap>(
  type: Type,
  handler: Handler<DocumentEventMap[Type]>,
): Effect.Effect<void, never, Scope.Scope | ViewScope> =>
  ViewScope.use(() => listen(document, type, handler))

export const fromWindow = <Type extends keyof WindowEventMap>(
  type: Type,
): Stream.Stream<WindowEventMap[Type]> =>
  events(
    {
      add: (listener: (event: WindowEventMap[Type]) => void) =>
        window.addEventListener(type, listener),
      remove: (listener) => window.removeEventListener(type, listener),
    },
    Function.identity,
  )

export const fromDocument = <Type extends keyof DocumentEventMap>(
  type: Type,
): Stream.Stream<DocumentEventMap[Type]> =>
  events(
    {
      add: (listener: (event: DocumentEventMap[Type]) => void) =>
        document.addEventListener(type, listener),
      remove: (listener) => document.removeEventListener(type, listener),
    },
    Function.identity,
  )

export const mediaQuery = (query: string): Effect.Effect<Reactive<boolean>, never, Scope.Scope> =>
  Effect.suspend(() => {
    const list = window.matchMedia(query)

    return fromStream(
      list.matches,
      events(on(list, "change"), () => list.matches),
    )
  })

const connection: Source<Event> = {
  add: (listener) => ["online", "offline"].forEach((type) => on(window, type).add(listener)),
  remove: (listener) => ["online", "offline"].forEach((type) => on(window, type).remove(listener)),
}

export const online: Effect.Effect<Reactive<boolean>, never, Scope.Scope> = Effect.suspend(() =>
  fromStream(
    navigator.onLine,
    events(connection, (event) => event.type === "online"),
  ),
)

export const visible: Effect.Effect<Reactive<boolean>, never, Scope.Scope> = Effect.suspend(() =>
  fromStream(
    document.visibilityState === "visible",
    events(on(document, "visibilitychange"), () => document.visibilityState === "visible"),
  ),
)
