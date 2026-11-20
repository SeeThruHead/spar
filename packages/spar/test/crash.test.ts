import { describe, expect, it } from "@effect/vitest"
import { screen } from "@testing-library/dom"
import { Context, Effect, Layer, SubscriptionRef, pipe, Schema } from "effect"
import { App, Props, Reactive, View, compose, withProps } from "spar"
import * as Testing from "spar/testing"
import { BrokenPartView, FussyItemView, PageView, WidgetView } from "./crashes.tsx"
import { RowsView } from "./graphics.tsx"
import { Item, ItemView, LoadingView } from "./views.tsx"

const Widget = pipe(
  compose(() => Effect.die("the widget's data is corrupt"))(WidgetView),
  View.crash(BrokenPartView),
)

const SlowWidget = pipe(
  compose(withProps({ id: Schema.String }), ({ id }) =>
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
  compose(
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
  {
    readonly seen: Effect.Effect<ReadonlyArray<unknown>>
    readonly wheres: Effect.Effect<ReadonlyArray<App.CrashWhere>>
  }
>()("test/Reports") {
  static readonly layer = Layer.effectContext(
    Effect.gen(function* () {
      const seen = yield* SubscriptionRef.make<ReadonlyArray<unknown>>([])

      const wheres = yield* SubscriptionRef.make<ReadonlyArray<App.CrashWhere>>([])

      return Context.make(Reports, {
        seen: SubscriptionRef.get(seen),
        wheres: SubscriptionRef.get(wheres),
      }).pipe(
        Context.add(App.CrashReporter, (defect, where) =>
          Effect.andThen(
            SubscriptionRef.update(seen, (all) => [...all, defect]),
            SubscriptionRef.update(wheres, (all) => [...all, where]),
          ),
        ),
      )
    }),
  )
}

const keyOf = (item: Item): string => {
  if (item.id === "broken") throw new TypeError("this item has no key")

  return item.id
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

        const [where] = yield* reports.wheres

        expect(where?.in.length).toBeGreaterThan(1)
        expect(where?.at).toMatch(/:\d+:\d+$/)

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

  it.live("a list that cannot work out its rows is reported and keeps what it showed", () =>
    Effect.gen(function* () {
      const reports = yield* Reports
      const list = yield* SubscriptionRef.make<ReadonlyArray<Item>>([{ id: "a", label: "Alpha" }])

      yield* Testing.mount(
        compose(
          Effect.fnUntraced(function* () {
            return {
              rows: yield* pipe(
                Reactive.fromSubscriptionRef(list),
                Reactive.mapBy(keyOf, ItemView, (item) => ({ item })),
              ),
            }
          }),
        )(RowsView),
      )
      yield* Testing.findText("Alpha")
      yield* SubscriptionRef.set(list, [{ id: "broken", label: "Beta" }])
      yield* Effect.sleep("20 millis")

      expect((yield* reports.seen).map(String)).toEqual(["TypeError: this item has no key"])
      expect((yield* Testing.find("listitem")).textContent).toBe("Alpha")
    }).pipe(Effect.provide(Reports.layer)),
  )

  it.live("a row that dies while it is made is reported, cleaned up, and the rest stay", () =>
    Effect.gen(function* () {
      const reports = yield* Reports
      const released = yield* SubscriptionRef.make(0)
      const list = yield* SubscriptionRef.make<ReadonlyArray<Item>>([{ id: "a", label: "Alpha" }])
      const Fragile = compose(
        withProps({ item: Props.Reactive(Item) }),
        Effect.fnUntraced(function* ({ item }) {
          const now = yield* item.get

          yield* Effect.addFinalizer(() => SubscriptionRef.update(released, (count) => count + 1))
          if (now.label === "Beta") return yield* Effect.die("this row cannot be shown")

          return { item }
        }),
      )(ItemView)

      yield* Testing.mount(
        compose(
          Effect.fnUntraced(function* () {
            return {
              rows: yield* pipe(
                Reactive.fromSubscriptionRef(list),
                Reactive.mapBy(keyOf, Fragile, (item) => ({ item })),
              ),
            }
          }),
        )(RowsView),
      )
      yield* Testing.findText("Alpha")
      yield* SubscriptionRef.update(list, (all) => [
        ...all,
        { id: "c", label: "Gamma" },
        { id: "b", label: "Beta" },
      ])
      yield* Effect.sleep("20 millis")

      expect(yield* reports.seen).toEqual(["this row cannot be shown"])
      expect(yield* SubscriptionRef.get(released)).toBe(2)
      expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["Alpha"])
    }).pipe(Effect.provide(Reports.layer)),
  )

  it.live("rows drawn just before one that cannot be drawn are taken back as well", () =>
    Effect.gen(function* () {
      const reports = yield* Reports
      const list = yield* SubscriptionRef.make<ReadonlyArray<Item>>([{ id: "a", label: "Alpha" }])

      yield* Testing.mount(
        compose(
          Effect.fnUntraced(function* () {
            return {
              rows: yield* pipe(
                Reactive.fromSubscriptionRef(list),
                Reactive.mapBy(keyOf, FussyItemView, (item) => ({ item })),
              ),
            }
          }),
        )(RowsView),
      )
      yield* Testing.findText("Alpha")
      yield* SubscriptionRef.update(list, (all) => [
        ...all,
        { id: "c", label: "Gamma" },
        { id: "b", label: "Beta" },
      ])
      yield* Effect.sleep("20 millis")

      expect((yield* reports.seen).map(String)).toEqual(["TypeError: Beta cannot be shown"])
      expect(screen.getAllByRole("listitem").map((row) => row.textContent)).toEqual(["Alpha"])

      yield* SubscriptionRef.update(list, (all) => all.filter((item) => item.label !== "Beta"))
      yield* Testing.findText("Gamma")
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
