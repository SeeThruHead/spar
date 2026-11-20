import { Effect, Option, SubscriptionRef } from "effect"
import { Reactive } from "spar"

export type AggregateStore<State, Command, Rejection> = {
  readonly state: Reactive.Reactive<State>
  readonly refused: Reactive.Reactive<Option.Option<Rejection>>
  readonly send: (command: Command) => Effect.Effect<void>
}

export const aggregateStore = Effect.fnUntraced(function* <State, Command, Rejection>(
  initial: State,
  send: (command: Command) => Effect.Effect<{ readonly reply: State }, Rejection>,
) {
  const state = yield* SubscriptionRef.make(initial)
  const refused = yield* SubscriptionRef.make(Option.none<Rejection>())

  return {
    state: Reactive.fromSubscriptionRef(state),
    refused: Reactive.fromSubscriptionRef(refused),
    send: (command: Command) =>
      send(command).pipe(
        Effect.flatMap(({ reply }) =>
          Effect.andThen(
            SubscriptionRef.set(state, reply),
            SubscriptionRef.set(refused, Option.none()),
          ),
        ),
        Effect.catch((rejection) => SubscriptionRef.set(refused, Option.some(rejection))),
      ),
  } satisfies AggregateStore<State, Command, Rejection>
})
