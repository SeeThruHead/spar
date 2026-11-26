import { Clock, Effect, Layer, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import type { Duration } from "effect"
import { Props, Query, Reactive, UiState, View, compose, withProps } from "spar"
import { LoadRowView, LoadsView } from "./LoadsView.tsx"

const Run = Schema.Struct({ run: Schema.Int, at: Schema.Finite })

type Run = typeof Run.Type

const Timed = Schema.Struct({ startedAt: Schema.Finite, endedAt: Schema.Finite })

type Timed = typeof Timed.Type

const scale = 900

const taking = (time: Duration.Input) =>
  Effect.fnUntraced(function* () {
    const startedAt = yield* Clock.currentTimeMillis

    yield* Effect.sleep(time)

    const endedAt = yield* Clock.currentTimeMillis

    return { startedAt, endedAt }
  })

const timed = { input: Run, success: Timed, failure: Schema.Never } as const

class ProfileQuery extends Query.Tag<ProfileQuery>()("site/demo/Profile", {
  ...timed,
  load: taking("400 millis"),
}) {}

class OrdersQuery extends Query.Tag<OrdersQuery>()("site/demo/Orders", {
  ...timed,
  load: taking("600 millis"),
}) {}

class SuggestionsQuery extends Query.Tag<SuggestionsQuery>()("site/demo/Suggestions", {
  ...timed,
  load: taking("300 millis"),
}) {}

export const queries = Layer.mergeAll(ProfileQuery.live, OrdersQuery.live, SuggestionsQuery.live)

const percent = (millis: number): string => `${Math.min(Math.max((millis / scale) * 100, 0), 100)}%`

const rowFields = {
  name: Schema.String,
  note: Schema.String,
  status: Props.Reactive(Schema.String),
  value: Props.Reactive(Schema.NullOr(Timed)),
  run: Props.Reactive(Schema.NullOr(Run)),
}

const LoadRow = compose(
  withProps(rowFields),
  Effect.fnUntraced(function* ({
    name,
    note,
    status,
    value,
    run,
  }: Schema.Struct<typeof rowFields>["Type"]) {
    const seen = yield* Reactive.zip(value, run)
    const span = Reactive.map(seen, ([timedNow, runNow]) =>
      timedNow === null || runNow === null
        ? { left: 0, width: 0 }
        : {
            left: timedNow.startedAt - runNow.at,
            width: timedNow.endedAt - timedNow.startedAt,
          },
    )

    return {
      name,
      note,
      status,
      took: Reactive.map(span, (now) => (now.width === 0 ? "" : `${now.width} ms`)),
      left: Reactive.map(span, (now) => percent(now.left)),
      width: Reactive.map(span, (now) => percent(now.width)),
    }
  }),
)(LoadRowView)

const endOf = (found: Timed | null): number => found?.endedAt ?? 0

const statusIn = (result: AsyncResult.AsyncResult<Timed>): string =>
  result.waiting
    ? "loading"
    : AsyncResult.match(result, {
        onInitial: () => "waiting",
        onFailure: () => "failed",
        onSuccess: () => "loaded",
      })

const shownOf = (handle: Query.Handle<Timed, never>) => ({
  status: Reactive.map(handle.result, statusIn),
  value: Query.valueOf(handle),
})

const told = (run: Run | null, ends: ReadonlyArray<number>): string => {
  if (run === null) return "Nothing loaded yet"
  if (ends.some((end) => end === 0)) return "Loading"

  return `Three requests that take 1,300 ms between them were done ${Math.max(...ends) - run.at} ms after the press.`
}

export const Loads = compose(
  Effect.fnUntraced(function* () {
    const run = yield* UiState.make("run", Schema.NullOr(Run), null)
    const asked = Reactive.map(run, Option.fromNullOr)
    const profile = yield* Effect.map(ProfileQuery.ask(asked), shownOf)
    const orders = yield* Effect.map(OrdersQuery.ask(asked), shownOf)
    const whenProfiled = yield* Reactive.zip(profile.value, run)
    const suggestions = yield* Effect.map(
      SuggestionsQuery.ask(
        Reactive.map(whenProfiled, ([found, now]) =>
          found === null ? Option.none<Run>() : Option.fromNullOr(now),
        ),
      ),
      shownOf,
    )
    const first = yield* Reactive.zip(profile.value, orders.value)
    const last = yield* Reactive.zip(suggestions.value, run)
    const ends = yield* Reactive.zip(first, last)

    return {
      rows: yield* Effect.all([
        View.child(LoadRow, { name: "Profile", note: "needs nothing", ...profile, run }),
        View.child(LoadRow, { name: "Orders", note: "needs nothing", ...orders, run }),
        View.child(LoadRow, {
          name: "Suggestions",
          note: "needs the profile",
          ...suggestions,
          run,
        }),
      ]),
      summary: Reactive.map(ends, ([[profiled, ordered], [suggested, now]]) =>
        told(now, [endOf(profiled), endOf(ordered), endOf(suggested)]),
      ),
      onRun: Effect.gen(function* () {
        const at = yield* Clock.currentTimeMillis
        const before = yield* run.get

        yield* UiState.set(run, { run: (before?.run ?? 0) + 1, at })
      }),
    }
  }),
)(LoadsView)
