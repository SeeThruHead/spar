import { describe, expect, it } from "@effect/vitest"
import { Context, Effect, Layer, SubscriptionRef, pipe } from "effect"
import { App, Reactive, View } from "spar"
import * as Testing from "spar/testing"
import { BrokenPartView, PageView, WidgetView } from "./crashes.tsx"
import { LoadingView } from "./views.tsx"

const Widget = pipe(
  View.connect(() => Effect.die("the widget's data is corrupt"))(WidgetView),
  View.crash(BrokenPartView),
)

const SlowWidget = pipe(
  View.connect(({ id }: { readonly id: string }) =>
    Effect.andThen(Effect.sleep("10 millis"), Effect.die(`${id} never loaded`)),
  )(WidgetView),
  View.pending(LoadingView),
  View.mapProps(() => ({ id: "report" })),
)

const upper = (text: string): string => {
  if (text === "explode") throw new TypeError("cannot shout that")

  return text.toUpperCase()
}

const Page = (widget: View.Mountable<App.NoProps>) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const label = yield* SubscriptionRef.make("calm")
      const reports = yield* SubscriptionRef.make(0)

      return {
        widget: yield* View.child(widget, {}),
        label: Reactive.map(Reactive.fromSubscriptionRef(label), upper),
        reports: Reactive.fromSubscriptionRef(reports),
        onBreak: Effect.die("the button's action is broken"),
        onRename: SubscriptionRef.update(label, (text) => (text === "calm" ? "loud" : "explode")),
      }
    }),
  )(PageView)

class Reports extends Context.Service<
  Reports,
  { readonly seen: Effect.Effect<ReadonlyArray<unknown>> }
>()("test/Reports") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const seen = yield* SubscriptionRef.make<ReadonlyArray<unknown>>([])

      return Context.make(Reports, { seen: SubscriptionRef.get(seen) }).pipe(
        Context.add(App.CrashReporter, (defect) =>
          SubscriptionRef.update(seen, (all) => [...all, defect]),
        ),
      )
    }),
  )
}

const label = (): string | null | undefined =>
  document.querySelector("[aria-label=Label]")?.textContent

describe("crashes", () => {
  it.live(
    "a part that dies while mounting shows its fallback, is reported once, and the rest works",
    () =>
      Effect.gen(function* () {
        const reports = yield* Reports

        yield* Testing.mount(Page(Widget))

        const alert = yield* Testing.find("alert")

        expect(alert.textContent).toBe("This part is unavailable: the widget's data is corrupt")
        expect(yield* reports.seen).toEqual(["the widget's data is corrupt"])

        yield* Testing.click("button", "Rename")
        yield* Testing.eventually(() => expect(label()).toBe("LOUD"))
      }).pipe(Effect.provide(Reports.layer)),
  )

  it.live("an action that dies is reported and its button keeps working", () =>
    Effect.gen(function* () {
      const reports = yield* Reports

      yield* Testing.mount(Page(Widget))
      yield* Testing.click("button", "Break")
      yield* Testing.click("button", "Break")
      yield* Testing.click("button", "Rename")
      yield* Testing.eventually(() => expect(label()).toBe("LOUD"))

      expect(yield* reports.seen).toEqual([
        "the widget's data is corrupt",
        "the button's action is broken",
        "the button's action is broken",
      ])
    }).pipe(Effect.provide(Reports.layer)),
  )

  it.live(
    "a value that cannot be shown and a load that dies behind a placeholder are reported",
    () =>
      Effect.gen(function* () {
        const reports = yield* Reports

        yield* Testing.mount(Page(SlowWidget))
        yield* Testing.click("button", "Rename")
        yield* Testing.click("button", "Rename")
        yield* Effect.sleep("50 millis")

        const defects = yield* reports.seen

        expect(defects.map(String).toSorted()).toEqual([
          "TypeError: cannot shout that",
          "report never loaded",
        ])
        expect((yield* Testing.findText("Loading report")).tagName).toBe("P")
      }).pipe(Effect.provide(Reports.layer)),
  )

  it.live("without a reporter a crash is logged and the page carries on", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Page(Widget))
      yield* Testing.click("button", "Break")
      yield* Testing.click("button", "Rename")
      yield* Testing.eventually(() => expect(label()).toBe("LOUD"))
    }),
  )
})
