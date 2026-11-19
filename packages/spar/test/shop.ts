import { Effect, pipe, Schema, Stream, SubscriptionRef } from "effect"
import { Events, Handle, Props, Reactive, UiState, View } from "spar"
import {
  DialogView,
  Fruit,
  FruitView,
  LoadingView,
  PageView,
  PairView,
  ReportView,
} from "./pages.tsx"

export const fruits: ReadonlyArray<Fruit> = [
  { id: "a", name: "Apple" },
  { id: "b", name: "Bread & butter" },
]

const Report = pipe(
  View.connect(() => Effect.as(Effect.sleep("5 millis"), { lines: 3 }))(ReportView),
  View.pending(LoadingView),
)

const Dialog = pipe(View.connect(() => Effect.succeed({}))(DialogView), View.portal)

const Row = View.taking({ fruit: Props.Reactive(Fruit) }, ({ fruit }) => Effect.succeed({ fruit }))(
  FruitView,
)

export const Page = (all: Reactive.Reactive<ReadonlyArray<Fruit>>) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const count = yield* UiState.make("count", Schema.Finite, 2)
      const busy = yield* UiState.make("busy", Schema.Boolean, true)
      const note = yield* SubscriptionRef.make("")
      const online = yield* Events.online

      yield* Events.onWindow("keydown", [])
      yield* Events.onDocument("click", [])
      yield* Reactive.fromStream(0, Stream.as(Events.fromWindow("resize"), 1))
      yield* Reactive.fromStream(0, Stream.as(Events.fromDocument("keyup"), 1))
      yield* Events.visible
      yield* Events.mediaQuery("(min-width: 600px)")

      return {
        title: "Fruit",
        count,
        busy,
        tone: Reactive.succeed<string | null>("red"),
        note: Reactive.fromSubscriptionRef(note),
        online,
        field: yield* Handle.make,
        fruits: yield* pipe(
          all,
          Reactive.mapBy(
            (fruit: Fruit) => fruit.id,
            Row,
            (fruit) => ({ fruit }),
          ),
        ),
        pairs: yield* pipe(
          all,
          Reactive.mapBy(
            (fruit: Fruit) => fruit.id,
            PairView,
            (fruit) => ({ fruit }),
          ),
        ),
        dialog: yield* View.child(Dialog, {}),
        report: yield* View.child(Report, {}),
        onAdd: UiState.update(count, (now) => now + 1),
      }
    }),
  )(PageView)
