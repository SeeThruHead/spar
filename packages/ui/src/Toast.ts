import { Context, Duration, Effect, Layer, Schema, pipe } from "effect"
import { Model, Reactive, Store, compose } from "spar"
import { ToastView, ToastsView } from "./ToastView.tsx"

const Tone = Schema.Literals(["info", "success", "problem"])

const Shown = Schema.Struct({ id: Schema.String, message: Schema.String, tone: Tone })

export type Toast = typeof Shown.Type

const State = Schema.Struct({ made: Schema.Int, showing: Schema.Array(Shown) })

type State = typeof State.Type

const stays = Duration.seconds(6)

const idOf = (number: number): string => `toast-${number}`

class ToastStore extends Model.Tag<ToastStore>()("spar/ui/ToastStore", {
  state: State,
  initialState: { made: 0, showing: [] },
  actions: {
    shown: Store.action(
      Schema.Struct({ message: Schema.String, tone: Tone }),
      (state: State, toast): State => ({
        made: state.made + 1,
        showing: [...state.showing, { id: idOf(state.made + 1), ...toast }],
      }),
    ),
    dismissed: Store.action(
      Schema.Struct({ id: Schema.String }),
      (state: State, { id }): State => ({
        ...state,
        showing: state.showing.filter((toast) => toast.id !== id),
      }),
    ),
  },
  selectors: {
    showing: Store.selector(Schema.Array(Shown), (state: State) => state.showing),
  },
}) {}

export class Toasts extends Context.Service<
  Toasts,
  {
    readonly showing: Reactive.Reactive<ReadonlyArray<Toast>>
    readonly show: (message: string, tone: Toast["tone"]) => Effect.Effect<void>
    readonly dismiss: (id: string) => Effect.Effect<void>
  }
>()("spar/ui/Toasts") {
  static readonly layer = Layer.effect(
    Toasts,
    Effect.gen(function* () {
      const store = yield* ToastStore
      const scope = yield* Effect.scope
      const dismiss = (id: string) => store.commands.dismissed({ id })

      return Toasts.of({
        showing: store.select.showing,
        show: Effect.fn("Toasts.show")(function* (message: string, tone: Toast["tone"]) {
          yield* store.commands.shown({ message, tone })

          const { made } = yield* store.state.get

          yield* Effect.forkIn(Effect.andThen(Effect.sleep(stays), dismiss(idOf(made))), scope)
        }),
        dismiss,
      })
    }),
  ).pipe(Layer.provide(ToastStore.layer))
}

export const Viewport = compose(
  Effect.fnUntraced(function* () {
    const service = yield* Toasts
    const toasts = yield* pipe(
      service.showing,
      Reactive.mapBy(
        (toast: Toast) => toast.id,
        ToastView,
        (toast, id) => ({
          message: Reactive.map(toast, (now) => now.message),
          tone: Reactive.map(toast, (now) => now.tone),
          onDismiss: service.dismiss(id),
        }),
      ),
    )

    return { toasts }
  }),
)(ToastsView)
