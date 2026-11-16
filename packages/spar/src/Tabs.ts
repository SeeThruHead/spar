import { Context, Effect, Function, Layer, Option, Stream } from "effect"
import type { Scope } from "effect"
import { events, on } from "./internal/listen.ts"

export type Tabs = {
  readonly exclusively: <A, E, R>(
    name: string,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>
  readonly announce: (name: string) => Effect.Effect<void>
  readonly announced: (name: string) => Stream.Stream<void>
  readonly stay: (name: string) => Effect.Effect<void, never, Scope.Scope>
  readonly here: (name: string) => Effect.Effect<boolean>
}

const alone: Tabs = {
  exclusively: (_name, effect) => effect,
  announce: () => Effect.void,
  announced: () => Stream.empty,
  stay: () => Effect.void,
  here: () => Effect.succeed(false),
}

export const Tabs = Context.Reference<Tabs>("spar/Tabs", { defaultValue: () => alone })

const sharedName = "spar/tabs"

const hold = (locks: LockManager, name: string): Effect.Effect<PromiseWithResolvers<void>> =>
  Effect.callback<PromiseWithResolvers<void>>((resume, signal) => {
    const held = Promise.withResolvers<void>()

    locks
      .request(name, { signal }, () => {
        resume(Effect.succeed(held))

        return held.promise
      })
      .catch(Function.constVoid)
  })

const lockManagers = Effect.sync(() => Option.toArray(Option.fromNullishOr(navigator.locks)))

const take = (name: string): Effect.Effect<ReadonlyArray<PromiseWithResolvers<void>>> =>
  Effect.flatMap(
    lockManagers,
    Effect.forEach((locks) => hold(locks, name)),
  )

const giveBack = (held: ReadonlyArray<PromiseWithResolvers<void>>): Effect.Effect<void> =>
  Effect.sync(() => held.forEach((lock) => lock.resolve()))

const exclusively = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => Effect.acquireUseRelease(take(name), () => effect, giveBack)

const stay = (name: string): Effect.Effect<void, never, Scope.Scope> =>
  Effect.asVoid(Effect.acquireRelease(take(name), giveBack))

const heldNames = (locks: LockManager): Effect.Effect<ReadonlyArray<string>> =>
  Effect.map(
    Effect.promise(() => locks.query()),
    (snapshot) =>
      Option.toArray(Option.fromNullishOr(snapshot.held))
        .flat()
        .flatMap((lock) => Option.toArray(Option.fromNullishOr(lock.name))),
  )

const here = (name: string): Effect.Effect<boolean> =>
  lockManagers.pipe(
    Effect.flatMap(Effect.forEach(heldNames)),
    Effect.map((names) => names.flat().includes(name)),
  )

const dataOf = (event: Event): unknown => Reflect.get(event, "data")

export const layerBrowser = Layer.effect(
  Tabs,
  Effect.gen(function* () {
    const peers = yield* Effect.acquireRelease(
      Effect.sync(() => new BroadcastChannel(sharedName)),
      (channel) => Effect.sync(() => channel.close()),
    )

    return {
      exclusively,
      stay,
      here,
      announce: (name) => Effect.sync(() => peers.postMessage(name)),
      announced: (name) =>
        events(on(peers, "message"), dataOf).pipe(
          Stream.filter((told) => told === name),
          Stream.map(Function.constVoid),
        ),
    }
  }),
)
