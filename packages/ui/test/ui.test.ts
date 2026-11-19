import { describe, expect, it } from "@effect/vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, Schema, SubscriptionRef, pipe } from "effect"
import { TestClock } from "effect/testing"
import { Form, Reactive, UiState, View } from "spar"
import * as Testing from "spar/testing"
import { Dialog, Menu, Select, Tabs, Toast } from "../src/index.ts"
import { KitView, TextView } from "./KitView.tsx"

const Profile = Schema.Struct({
  name: Schema.String.check(Schema.makeFilter((text) => text.length > 0 || "Enter a name")),
  plan: Schema.String.check(
    Schema.makeFilter((plan) => ["free", "team"].includes(plan) || "Pick a plan"),
  ),
  news: Schema.Boolean,
})

const Kit = View.connect(
  Effect.fnUntraced(function* () {
    const toasts = yield* Toast.Toasts
    const form = yield* Form.make(Profile, { name: "", plan: "team", news: false })
    const dark = yield* UiState.make("dark", Schema.Boolean, false)
    const open = yield* UiState.make("open", Schema.Boolean, false)
    const saved = yield* SubscriptionRef.make("")
    const note = (text: string) => SubscriptionRef.set(saved, text)

    return {
      name: form.field("name"),
      plan: Select({
        id: "plan",
        label: "Plan",
        field: form.field("plan"),
        options: [
          { value: "free", label: "Free" },
          { value: "team", label: "Team" },
        ],
      }),
      news: form.field("news"),
      busy: form.submitting,
      dark,
      never: Reactive.succeed(false),
      saved: Reactive.fromSubscriptionRef(saved),
      onSubmit: form.submit((profile) => note(`${profile.name} on ${profile.plan}`)),
      onToggleDark: UiState.update(dark, (on) => !on),
      onOpen: UiState.set(open, true),
      onNotify: toasts.show("Saved your profile", "success"),
      tabs: yield* View.child(Tabs, {
        label: "Sections",
        tabs: [
          { id: "one", title: "Overview", content: TextView({ text: "The overview" }) },
          { id: "two", title: "Members", content: TextView({ text: "The members" }) },
          { id: "three", title: "Billing", content: TextView({ text: "The billing" }) },
        ],
      }),
      menu: yield* View.child(Menu, {
        label: "More",
        text: "More",
        items: [
          { label: "Rename", onChoose: note("renamed") },
          { label: "Archive", onChoose: note("archived") },
        ],
      }),
      dialog: yield* pipe(
        open,
        Reactive.when(
          Dialog(
            { id: "details", title: "Details" },
            View.child(TextView, { text: "All the details" }),
          ),
          { onClose: UiState.set(open, false) },
        ),
      ),
      toasts: yield* View.child(Toast.Viewport, {}),
    }
  }),
)(KitView)

const saved = (): string | null => screen.getByLabelText("Saved").textContent

const key = (name: string, pressed: string) =>
  Effect.flatMap(Testing.find("tab", name), (tab) =>
    Effect.sync(() => fireEvent.keyDown(tab, { key: pressed })),
  )

const selectedTab = (): string | null | undefined =>
  screen.getAllByRole("tab").find((tab) => tab.getAttribute("aria-selected") === "true")
    ?.textContent

const focused = (): string | null | undefined => document.activeElement?.textContent

describe("the component kit", () => {
  it.live("a form built from the kit validates, labels its problems and submits", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)

      const name = yield* Testing.find("textbox", "Name")
      const plan = yield* Testing.find("combobox", "Plan")

      expect(plan).toHaveProperty("value", "team")
      expect(name.getAttribute("aria-describedby")).toBe("name-hint name-problem")

      yield* Testing.click("button", "Save")
      yield* Testing.eventually(() =>
        expect(document.querySelector("#name-problem")?.textContent).toBe("Enter a name"),
      )

      expect(name.getAttribute("aria-invalid")).toBe("true")

      yield* Testing.fill("textbox", "Name", "Ada")
      yield* Effect.sync(() => fireEvent.input(plan, { target: { value: "free" } }))
      yield* Testing.click("checkbox", "Send me news")
      yield* Testing.click("button", "Save")
      yield* Testing.eventually(() => expect(saved()).toBe("Ada on free"))
    }).pipe(Effect.provide(Toast.Toasts.layer)),
  )

  it.live("a switch reports its state and flips when pressed", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)

      const toggle = yield* Testing.find("switch", "Dark mode")

      expect(toggle.getAttribute("aria-checked")).toBe("false")

      yield* Testing.click("switch", "Dark mode")
      yield* Testing.eventually(() => expect(toggle.getAttribute("aria-checked")).toBe("true"))
    }).pipe(Effect.provide(Toast.Toasts.layer)),
  )

  it.live("tabs move with the arrow keys, Home and End, and show one panel", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)
      yield* Testing.find("tab", "Overview")

      expect(selectedTab()).toBe("Overview")
      expect(screen.getByRole("tabpanel").textContent).toBe("The overview")

      yield* key("Overview", "ArrowRight")
      yield* Testing.eventually(() =>
        expect([selectedTab(), focused()]).toEqual(["Members", "Members"]),
      )
      yield* key("Members", "End")
      yield* Testing.eventually(() => expect(selectedTab()).toBe("Billing"))
      yield* key("Billing", "ArrowRight")
      yield* Testing.eventually(() => expect(selectedTab()).toBe("Overview"))
      yield* key("Overview", "ArrowLeft")
      yield* Testing.eventually(() => expect(selectedTab()).toBe("Billing"))
      yield* key("Billing", "Home")
      yield* key("Overview", "a")
      yield* Testing.eventually(() => expect(selectedTab()).toBe("Overview"))
      yield* Testing.click("tab", "Members")
      yield* Testing.eventually(() =>
        expect(screen.getByRole("tabpanel").textContent).toBe("The members"),
      )

      expect(screen.getByRole("tab", { name: "Overview" })).toHaveProperty("tabIndex", -1)
    }).pipe(Effect.provide(Toast.Toasts.layer)),
  )

  it.live(
    "a menu opens on its first item, moves with the arrows, and closes back to its button",
    () =>
      Effect.gen(function* () {
        yield* Testing.mount(Kit)
        yield* Testing.click("button", "More")

        const rename = yield* Testing.find("menuitem", "Rename")
        const more = yield* Testing.find("button", "More")

        yield* Testing.eventually(() => expect(document.activeElement).toBe(rename))

        expect(more.getAttribute("aria-expanded")).toBe("true")

        yield* Effect.sync(() => fireEvent.keyDown(rename, { key: "ArrowUp" }))
        yield* Testing.eventually(() => expect(focused()).toBe("Archive"))
        yield* Effect.sync(() =>
          fireEvent.keyDown(screen.getByRole("menuitem", { name: "Archive" }), {
            key: "ArrowDown",
          }),
        )
        yield* Testing.eventually(() => expect(focused()).toBe("Rename"))
        yield* Effect.sync(() => fireEvent.keyDown(rename, { key: "ArrowDown" }))
        yield* Testing.eventually(() => expect(focused()).toBe("Archive"))
        yield* Effect.sync(() =>
          fireEvent.keyDown(screen.getByRole("menuitem", { name: "Archive" }), { key: "x" }),
        )
        yield* Testing.click("menuitem", "Archive")
        yield* Testing.gone("menu")
        yield* Testing.eventually(() =>
          expect([saved(), document.activeElement]).toEqual(["archived", more]),
        )

        yield* Testing.click("button", "More")
        yield* Effect.flatMap(Testing.find("menuitem", "Rename"), (item) =>
          Effect.sync(() => fireEvent.keyDown(item, { key: "Tab" })),
        )
        yield* Testing.gone("menu")
      }).pipe(Effect.provide(Toast.Toasts.layer)),
  )

  it.live("a dialog is labelled by its title and closes from its button or its backdrop", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)
      yield* Testing.click("button", "Open details")

      const dialog = yield* Testing.find("dialog", "Details")

      yield* Testing.eventually(() => expect(focused()).toBe("Close"))
      yield* Effect.sync(() => fireEvent.click(dialog))
      yield* Effect.sleep("20 millis")

      expect(screen.getByRole("dialog", { name: "Details" })).toBe(dialog)

      yield* Testing.click("button", "Close")
      yield* Testing.gone("dialog")
      yield* Testing.click("button", "Open details")
      yield* Effect.flatMap(Testing.find("dialog", "Details"), (opened) =>
        Effect.sync(() => fireEvent.click(opened.parentElement ?? opened)),
      )
      yield* Testing.gone("dialog")
    }).pipe(Effect.provide(Toast.Toasts.layer)),
  )

  it.effect("a toast is announced, can be dismissed, and leaves by itself", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Kit)
      yield* Testing.click("button", "Notify")
      yield* Testing.click("button", "Notify")

      yield* Testing.eventually(() =>
        expect(screen.getAllByText("Saved your profile").length).toBe(2),
      )

      const first = screen.getAllByText("Saved your profile")

      expect(first[0]?.closest("li")?.getAttribute("data-tone")).toBe("success")
      expect(screen.getByRole("status", { name: "Notifications" })).toBeDefined()

      yield* Effect.sync(() =>
        fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[0] ?? document.body),
      )
      yield* Testing.eventually(() =>
        expect(screen.getAllByText("Saved your profile").length).toBe(1),
      )
      yield* TestClock.adjust("6 seconds")
      yield* Testing.eventually(() => expect(screen.queryByText("Saved your profile")).toBeNull())
    }).pipe(Effect.provide(Toast.Toasts.layer)),
  )
})
