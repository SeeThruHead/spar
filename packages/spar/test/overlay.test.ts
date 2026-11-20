import { describe, expect, it } from "@effect/vitest"
import { vi } from "vitest"
import { fireEvent, screen } from "@testing-library/dom"
import { Effect, Layer, pipe, Schema } from "effect"
import { App, Handle, Overlay, Props, Reactive, UiState, View, compose, withProps } from "spar"
import * as Testing from "spar/testing"
import { ConfirmView, DialogView, MenuView, PageView } from "./overlays.tsx"

const Confirm = pipe(
  compose(
    withProps({ onClose: Props.Action }),
    Effect.fnUntraced(function* ({ onClose }) {
      yield* Overlay.modal({ onDismiss: onClose })

      return { onClose }
    }),
  )(ConfirmView),
  View.portal,
)

const Dialog = pipe(
  compose(
    withProps({ onClose: Props.Action }),
    Effect.fnUntraced(function* ({ onClose }) {
      const close = yield* Handle.make
      const confirming = yield* UiState.make("confirming", Schema.Boolean, false)

      yield* Overlay.modal({ onDismiss: onClose, initialFocus: close })

      return {
        title: "Settings",
        close,
        onClose,
        onConfirm: UiState.set(confirming, true),
        confirm: yield* pipe(
          confirming,
          Reactive.when(Confirm, { onClose: UiState.set(confirming, false) }),
        ),
      }
    }),
  )(DialogView),
  View.portal,
)

const Menu = pipe(
  compose(
    withProps({ anchor: Props.Handle, onClose: Props.Action }),
    Effect.fnUntraced(function* (props) {
      yield* Overlay.dismissable({ onDismiss: props.onClose, anchor: props.anchor })

      return { place: yield* Overlay.position(props.anchor), onPick: props.onClose }
    }),
  )(MenuView),
  View.portal,
)

const LooseMenu = pipe(
  compose(
    Effect.fnUntraced(function* () {
      const nowhere = yield* Handle.make

      yield* Overlay.dismissable({ onDismiss: [] })

      return { place: yield* Overlay.position(nowhere), onPick: [] }
    }),
  )(MenuView),
  View.portal,
)

const Page = compose(
  Effect.fnUntraced(function* () {
    const dialogOpen = yield* UiState.make("dialogOpen", Schema.Boolean, false)
    const menuOpen = yield* UiState.make("menuOpen", Schema.Boolean, false)
    const more = yield* Handle.make

    return {
      more,
      onOpenDialog: UiState.set(dialogOpen, true),
      onOpenMenu: UiState.update(menuOpen, (open) => !open),
      dialog: yield* pipe(
        dialogOpen,
        Reactive.when(Dialog, { onClose: UiState.set(dialogOpen, false) }),
      ),
      menu: yield* pipe(
        menuOpen,
        Reactive.when(Menu, { anchor: more, onClose: UiState.set(menuOpen, false) }),
      ),
    }
  }),
)(PageView)

const overlays = (): Element | null => document.querySelector("[data-spar-overlays]")

const appRoot = (): Element | null | undefined =>
  screen.getByText("Somewhere else on the page").closest("main")?.parentElement

const escape = Effect.sync(() => fireEvent.keyDown(document, { key: "Escape" }))

const openSettings = Effect.gen(function* () {
  const trigger = yield* Testing.find("button", "Open settings")

  yield* Effect.sync(() => trigger.focus())
  yield* Testing.click("button", "Open settings")

  return trigger
})

describe("overlays", () => {
  it.live("a dialog sits above the app, takes focus, and puts everything back when it closes", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Page)

      const trigger = yield* openSettings
      const dialog = yield* Testing.find("dialog", "Settings")
      const close = yield* Testing.find("button", "Close Settings")

      yield* Testing.eventually(() => expect(document.activeElement).toBe(close))

      const last = yield* Testing.find("button", "Ask to confirm")
      const kept = yield* Effect.sync(() => [
        fireEvent.keyDown(close, { key: "Tab" }),
        fireEvent.keyDown(close, { key: "Tab", shiftKey: true }),
        document.activeElement === last,
        fireEvent.keyDown(last, { key: "Tab" }),
        document.activeElement === close,
      ])

      expect(kept).toEqual([true, false, true, false, true])
      expect(overlays()?.contains(dialog)).toBe(true)
      expect(appRoot()?.contains(dialog)).toBe(false)
      expect(appRoot()?.hasAttribute("inert")).toBe(true)
      expect(document.documentElement.style.overflow).toBe("hidden")

      yield* Effect.sync(() => fireEvent.keyDown(document, { key: "a" }))
      yield* escape
      yield* Testing.gone("dialog")

      expect(appRoot()?.hasAttribute("inert")).toBe(false)
      expect(document.documentElement.style.overflow).toBe("")
      expect(document.activeElement).toBe(trigger)
      expect(overlays()?.childElementCount).toBe(0)
    }),
  )

  it.live("with two dialogs open, Escape closes the top one and the lower one wakes up", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Page)
      yield* openSettings
      yield* Testing.click("button", "Ask to confirm")

      const confirm = yield* Testing.find("alertdialog", "Are you sure?")
      const lower = screen.getByLabelText("Settings").parentElement

      yield* Testing.eventually(() => expect(document.activeElement).toBe(confirm.parentElement))

      expect(lower?.hasAttribute("inert")).toBe(true)

      yield* escape
      yield* Testing.gone("alertdialog")

      expect(lower?.hasAttribute("inert")).toBe(false)
      expect(appRoot()?.hasAttribute("inert")).toBe(true)
      expect(screen.getByRole("dialog", { name: "Settings" })).toBeDefined()

      yield* escape
      yield* Testing.gone("dialog")
    }),
  )

  it.live("a menu sits by its button and closes on Escape or a press anywhere else", () =>
    Effect.gen(function* () {
      const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      const stopped = vi.spyOn(window, "removeEventListener")
      const middle = (window.innerHeight - 30) / 2

      box.mockReturnValue(new DOMRect(40, 100, 80, 30))

      yield* Testing.mount(Page)
      yield* Testing.click("button", "More")

      const menu = yield* Testing.find("menu", "More")
      const more = yield* Testing.find("button", "More")

      expect([menu.style.left, menu.style.top, menu.style.bottom, menu.style.minWidth]).toEqual([
        "40px",
        "130px",
        "",
        "80px",
      ])
      expect([menu.style.right, menu.style.maxWidth, menu.style.maxHeight]).toEqual([
        "",
        "calc(100vw - 16px)",
        `${window.innerHeight - 130 - 8}px`,
      ])

      box.mockReturnValue(new DOMRect(window.innerWidth - 100, 700, 80, 30))

      yield* Effect.sync(() => window.dispatchEvent(new Event("resize")))
      yield* Testing.eventually(() =>
        expect([menu.style.left, menu.style.right, menu.style.maxHeight]).toEqual([
          "",
          "20px",
          "692px",
        ]),
      )

      box.mockReturnValue(new DOMRect(-30, 100, 80, 30))

      yield* Effect.sync(() => window.dispatchEvent(new Event("resize")))
      yield* Testing.eventually(() =>
        expect([menu.style.left, menu.style.right]).toEqual(["8px", ""]),
      )

      box.mockReturnValue(new DOMRect(window.innerWidth - 40, 100, 80, 30))

      yield* Effect.sync(() => window.dispatchEvent(new Event("resize")))
      yield* Testing.eventually(() =>
        expect([menu.style.left, menu.style.right]).toEqual(["", "8px"]),
      )

      box.mockReturnValue(new DOMRect(40, window.innerHeight - 10, 80, 30))

      yield* Effect.sync(() => window.dispatchEvent(new Event("resize")))
      yield* Testing.eventually(() =>
        expect(menu.style.maxHeight).toBe(`${window.innerHeight - 10 - 8}px`),
      )

      box.mockReturnValue(new DOMRect(40, 4, 80, window.innerHeight))

      yield* Effect.sync(() => window.dispatchEvent(new Event("resize")))
      yield* Testing.eventually(() => expect(menu.style.maxHeight).toBe("0px"))

      box.mockReturnValue(new DOMRect(40, 700, 80, 30))

      yield* Effect.sync(() => window.dispatchEvent(new Event("resize")))
      yield* Testing.eventually(() =>
        expect([menu.style.top, menu.style.bottom]).toEqual(["", `${window.innerHeight - 700}px`]),
      )
      box.mockReturnValue(new DOMRect(40, middle, 80, 30))

      yield* Effect.sync(() => document.dispatchEvent(new Event("scroll")))
      yield* Testing.eventually(() =>
        expect([menu.style.top, menu.style.bottom]).toEqual([`${middle + 30}px`, ""]),
      )

      box.mockReturnValue(new DOMRect(40, middle + 11, 80, 30))

      yield* Effect.sync(() => window.dispatchEvent(new Event("resize")))
      yield* Testing.eventually(() =>
        expect([menu.style.top, menu.style.bottom]).toEqual([
          "",
          `${window.innerHeight - middle - 11}px`,
        ]),
      )
      yield* Effect.sync(() => fireEvent.pointerDown(menu))
      yield* Effect.sync(() => fireEvent.pointerDown(more))
      yield* Effect.sync(() => fireEvent.keyDown(document.body, { key: "a" }))
      yield* Effect.sync(() => document.dispatchEvent(new Event("keydown")))
      yield* Effect.sleep("20 millis")

      expect(screen.getByRole("menu", { name: "More" })).toBe(menu)

      yield* Effect.sync(() =>
        fireEvent.pointerDown(screen.getByText("Somewhere else on the page")),
      )
      yield* Testing.gone("menu")
      yield* Testing.click("button", "More")
      yield* Testing.find("menu", "More")
      yield* escape
      yield* Testing.gone("menu")

      expect(stopped.mock.calls.filter(([type]) => type === "resize")).toHaveLength(2)
      expect(
        stopped.mock.calls.filter(([type]) => type === "scroll").map(([, , capture]) => capture),
      ).toEqual([true, true])

      stopped.mockRestore()
      box.mockRestore()
    }),
  )

  it.live("an app with overlays needs no layer for them, and a lost button means the corner", () =>
    Effect.gen(function* () {
      const target = yield* Effect.acquireRelease(
        Effect.sync(() => document.body.appendChild(document.createElement("div"))),
        (node) => Effect.sync(() => node.remove()),
      )

      yield* Effect.forkScoped(
        App.mount(
          pipe(
            LooseMenu,
            View.mapProps(() => ({})),
          ),
          { target, layer: Layer.empty },
        ),
        { startImmediately: true },
      )

      const menu = yield* Testing.find("menu", "More")

      expect([menu.style.position, menu.style.left, menu.style.top]).toEqual([
        "fixed",
        "8px",
        "0px",
      ])

      yield* Effect.sync(() => fireEvent.pointerDown(document.body))
    }),
  )
})
