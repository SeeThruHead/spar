import { Context, Duration, Effect, Layer, Ref, SubscriptionRef, pipe } from "effect"
import { Reactive, View } from "spar"
import { ToastView, ToastsView } from "./ToastView.tsx"

export type Toast = {
  readonly id: string
  readonly message: string
  readonly tone: "info" | "success" | "problem"
}

const stays = Duration.seconds(6)

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
      const scope = yield* Effect.scope
      const count = yield* Ref.make(0)
      const showing = yield* SubscriptionRef.make<ReadonlyArray<Toast>>([])

      const dismiss = (id: string): Effect.Effect<void> =>
        SubscriptionRef.update(showing, (all) => all.filter((toast) => toast.id !== id))

      const show = Effect.fn("Toasts.show")(function* (message: string, tone: Toast["tone"]) {
        const number = yield* Ref.updateAndGet(count, (last) => last + 1)
        const id = `toast-${number}`

        yield* SubscriptionRef.update(showing, (all) => [...all, { id, message, tone }])
        yield* Effect.forkIn(Effect.andThen(Effect.sleep(stays), dismiss(id)), scope)
      })

      return Toasts.of({ showing: Reactive.fromSubscriptionRef(showing), show, dismiss })
    }),
  )
}

export const Viewport = View.connect(
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
