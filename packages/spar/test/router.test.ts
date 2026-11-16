import { describe, expect, it, vi } from "@effect/vitest"
import { fireEvent } from "@testing-library/dom"
import { Effect, Latch, Layer, Option, Ref, Schema, pipe } from "effect"
import { Handle, Router, View } from "spar"
import type { Element } from "spar"
import * as Testing from "spar/testing"
import {
  BillingView,
  HomeView,
  LiveSearchView,
  NotFoundView,
  ProfileView,
  SearchView,
  SettingsView,
  ShellView,
  ThreadLoadingView,
  ThreadView,
} from "./routes.tsx"

const home = Router.route("/")
const thread = Router.route("/threads/:id")
const search = Router.route(
  "/search/:kind",
  Schema.Struct({
    kind: Schema.Literals(["mail", "people"]),
    page: Schema.optional(Schema.FiniteFromString),
  }),
)
const settings = Router.route("/settings/*")
const profile = Router.route("/settings/profile")
const billing = Router.route("/settings/billing")

const at = (url: string): Router.Location => {
  const parsed = new URL(url, "http://test.invalid")

  return { pathname: parsed.pathname, search: parsed.search }
}

const paramsAt = <Params>(target: Router.Route<Params>, url: string) =>
  Option.map(target.parse(at(url)), (matched) => matched.params)

const Thread = (loads: Ref.Ref<ReadonlyArray<string>>, server: Latch.Latch) =>
  pipe(
    View.connect(
      Effect.fnUntraced(function* ({ id }: { readonly id: string }) {
        yield* Ref.update(loads, (all) => [...all, id])
        yield* Latch.whenOpen(server, Effect.void)

        return { subject: `Thread ${id}` }
      }),
    )(ThreadView),
    View.pending(ThreadLoadingView),
  )

const Settings = (mounts: Ref.Ref<number>) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const router = yield* Router.Router

      yield* Ref.update(mounts, (count) => count + 1)

      return {
        profile: router.link(profile, {}),
        billing: router.link(billing, {}),
        section: yield* Router.outlet({
          routes: [Router.on(profile, ProfileView), Router.on(billing, BillingView)],
          otherwise: NotFoundView,
        }),
      }
    }),
  )(SettingsView)

const Shell = (
  loads: Ref.Ref<ReadonlyArray<string>>,
  mounts: Ref.Ref<number>,
  server: Latch.Latch,
) =>
  View.connect(
    Effect.fnUntraced(function* () {
      const router = yield* Router.Router
      const main = yield* Handle.make

      yield* Router.focusOnChange(main)

      return {
        home: router.link(home, {}),
        welcome: router.link(thread, { id: "welcome" }),
        profile: router.link(profile, {}),
        main,
        page: yield* Router.outlet({
          routes: [
            Router.on(home, HomeView),
            Router.on(thread, Thread(loads, server)),
            Router.on(search, SearchView),
            Router.on(settings, Settings(mounts)),
          ],
          otherwise: NotFoundView,
        }),
      }
    }),
  )(ShellView)

const app = Effect.fnUntraced(function* () {
  const loads = yield* Ref.make<ReadonlyArray<string>>([])
  const mounts = yield* Ref.make(0)
  const server = yield* Latch.make(true)

  yield* Testing.mount(Shell(loads, mounts, server))

  return { loads: Ref.get(loads), mounts: Ref.get(mounts), server }
})

const heading = (name: string) => Testing.find("heading", name)

describe("routes", () => {
  it("a route builds a URL from its params and reads the same params back", () => {
    expect(home.build({})).toBe("/")
    expect(paramsAt(thread, thread.build({ id: "*" }))).toEqual(Option.some({ id: "*" }))
    expect(thread.build({ id: "a b/c" })).toBe("/threads/a%20b%2Fc")
    expect(paramsAt(thread, "/threads/a%20b%2Fc")).toEqual(Option.some({ id: "a b/c" }))
    expect(search.build({ kind: "mail", page: 2 })).toBe("/search/mail?page=2")
    expect(search.build({ kind: "people" })).toBe("/search/people")
    expect(paramsAt(search, "/search/mail?page=2")).toEqual(Option.some({ kind: "mail", page: 2 }))
  })

  it("a URL that does not fit a route does not match it", () => {
    expect(Option.isNone(paramsAt(home, "/threads"))).toBe(true)
    expect(Option.isNone(paramsAt(thread, "/threads"))).toBe(true)
    expect(Option.isNone(paramsAt(thread, "/threads/a/b"))).toBe(true)
    expect(Option.isNone(paramsAt(thread, "/people/a"))).toBe(true)
    expect(Option.isNone(paramsAt(search, "/search/cats"))).toBe(true)
    expect(Option.isNone(thread.parse({ pathname: "/threads/%E0%A4%A", search: "" }))).toBe(true)
  })

  it("an open route matches everything under its prefix", () => {
    expect(Option.isSome(paramsAt(settings, "/settings"))).toBe(true)
    expect(Option.isSome(paramsAt(settings, "/settings/profile/photo"))).toBe(true)
    expect(Option.isNone(paramsAt(settings, "/set"))).toBe(true)
  })

  it.prop(
    "any id survives the trip through a URL, except the two dot names a URL cannot hold",
    [Schema.NonEmptyString],
    ([id]) => {
      expect(paramsAt(thread, thread.build({ id }))).toEqual(
        id === "." || id === ".." ? Option.none() : Option.some({ id: id.toWellFormed() }),
      )
    },
  )
})

describe("the router", () => {
  it.live("shows the page for the current URL and changes page when a link is clicked", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const { loads, server } = yield* app()

      yield* heading("Home")
      yield* Latch.close(server)
      yield* Testing.click("link", "Welcome thread")
      yield* Testing.findText("Loading thread welcome")
      yield* Latch.open(server)
      yield* heading("Thread welcome")
      yield* router.go(thread, { id: "second" })
      yield* heading("Thread second")

      expect(yield* loads).toEqual(["welcome", "second"])
      expect((yield* router.location.get).pathname).toBe("/threads/second")

      yield* router.back
      yield* heading("Thread welcome")
      yield* router.replace(search, { kind: "people", page: 3 })
      yield* heading("Searching people, page 3")
      yield* router.back
      yield* heading("Home")
      yield* router.back
      yield* heading("Home")
    }).pipe(Effect.provide(Router.Router.layerMemory("/"))),
  )

  it.live("a click meant for a new tab is left to the browser", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router

      yield* app()

      const link = yield* Testing.find("link", "Welcome thread")
      const left = yield* Effect.sync(() => [
        fireEvent.click(link, { ctrlKey: true }),
        fireEvent.click(link, { button: 1 }),
        link.dispatchEvent(new Event("click", { bubbles: true, cancelable: true })),
      ])

      yield* Effect.sleep("20 millis")

      expect(left).toEqual([true, true, true])
      expect(link.getAttribute("href")).toBe("/threads/welcome")
      expect((yield* router.location.get).pathname).toBe("/")
    }).pipe(Effect.provide(Router.Router.layerMemory("/"))),
  )

  it.live("a URL no route takes shows the fallback with the path", () =>
    Effect.gen(function* () {
      yield* app()

      expect((yield* Testing.find("alert")).textContent).toBe("Nothing lives at /nowhere/at/all")
    }).pipe(Effect.provide(Router.Router.layerMemory("/nowhere/at/all?x=1"))),
  )

  it.live("a layout stays mounted while its inner pages change", () =>
    Effect.gen(function* () {
      const { mounts } = yield* app()

      yield* heading("Profile")
      yield* Testing.click("link", "Billing")
      yield* heading("Billing")
      yield* Testing.click("link", "Profile")
      yield* heading("Profile")

      expect(yield* mounts).toBe(1)
    }).pipe(Effect.provide(Router.Router.layerMemory("/settings/profile"))),
  )

  it.effect("going back steps through each earlier page in turn", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const path = Effect.map(router.location.get, (location) => location.pathname)

      yield* router.go(thread, { id: "one" })
      yield* router.go(thread, { id: "two" })
      yield* router.go(thread, { id: "three" })
      yield* router.back

      expect(yield* path).toBe("/threads/two")

      yield* router.back

      expect(yield* path).toBe("/threads/one")

      yield* router.back

      expect(yield* path).toBe("/")
    }).pipe(Effect.provide(Router.Router.layerMemory("/"))),
  )

  it.live("focus moves to the page after a navigation", () =>
    Effect.gen(function* () {
      yield* app()
      yield* Testing.click("link", "Settings")
      yield* heading("Profile")
      yield* Testing.eventually(() => expect(document.activeElement?.tagName).toBe("MAIN"))
    }).pipe(Effect.provide(Router.Router.layerMemory("/"))),
  )

  it.live("a live page stays as it is while only its query changes, and follows it", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const mounts = yield* Ref.make(0)
      const LiveSearch = View.connect(
        Effect.fnUntraced(function* (props: Parameters<typeof LiveSearchView>[0]) {
          yield* Ref.update(mounts, (count) => count + 1)

          return props
        }),
      )(LiveSearchView)

      yield* Testing.mount(
        View.connect(
          Effect.fnUntraced(function* () {
            return {
              page: yield* Router.outlet({
                routes: [Router.live(search, LiveSearch)],
                otherwise: NotFoundView,
              }),
            }
          }),
        )(({ page }: { readonly page: Element }) => page),
      )

      const first = yield* heading("Live mail, page 1")

      yield* router.go(search, { kind: "mail", page: 2 })

      expect(yield* heading("Live mail, page 2")).toBe(first)
      expect(yield* Ref.get(mounts)).toBe(1)

      yield* router.go(search, { kind: "people" })

      expect(yield* heading("Live people, page 1")).not.toBe(first)
      expect(yield* Ref.get(mounts)).toBe(2)
    }).pipe(Effect.provide(Router.Router.layerMemory("/search/mail"))),
  )

  it.live("in a browser, going back puts the page where it was scrolled to", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const scrolled = vi.spyOn(window, "scrollTo")
      const height = vi.spyOn(window, "scrollY", "get")

      expect(window.history.scrollRestoration).toBe("manual")

      height.mockReturnValue(300)
      yield* router.go(thread, { id: "welcome" })

      const entry: unknown = window.history.state

      expect(sessionStorage.getItem("spar/scroll/first")).toBe("[0,300]")
      expect(entry).toEqual({ sparEntry: expect.any(String) })

      height.mockReturnValue(40)
      yield* router.replace(thread, { id: "second" })

      expect(window.history.state).toEqual(entry)

      yield* Effect.sync(() => window.history.replaceState({ sparEntry: 7 }, "", "/"))
      yield* Effect.sync(() => window.dispatchEvent(new PopStateEvent("popstate")))
      yield* Testing.eventually(() => expect(scrolled.mock.calls.at(-1)).toEqual([0, 300]))

      expect(sessionStorage.getItem("spar/scroll/1")).toBe("[0,40]")

      height.mockReturnValue(300)
      yield* Effect.sleep("120 millis")

      const settledAt = scrolled.mock.calls.length

      yield* Effect.sleep("120 millis")

      expect(scrolled.mock.calls).toHaveLength(settledAt)

      height.mockReturnValue(0)
      yield* Effect.sync(() => window.history.replaceState({ sparEntry: "never seen" }, "", "/"))
      yield* Effect.sync(() => window.dispatchEvent(new PopStateEvent("popstate")))
      yield* Testing.eventually(() => expect(scrolled.mock.calls.at(-1)).toEqual([0, 0]))
      scrolled.mockRestore()
      height.mockRestore()
      sessionStorage.clear()
    }).pipe(Effect.provide(Layer.fresh(Router.Router.layerBrowser))),
  )

  it.live("in a browser it drives the address bar and follows back and forward", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const scrolled = vi.spyOn(window, "scrollTo")
      const wentBack = vi.spyOn(window.history, "back")

      yield* router.go(thread, { id: "welcome" })

      expect(window.location.pathname).toBe("/threads/welcome")
      expect(scrolled.mock.calls).toEqual([[0, 0]])

      yield* router.replace(search, { kind: "mail" })

      expect(window.location.pathname).toBe("/search/mail")
      expect(scrolled.mock.calls).toHaveLength(1)
      expect(wentBack.mock.calls).toHaveLength(0)

      yield* Effect.sync(() => window.history.replaceState(null, "", "/settings/billing"))
      yield* Effect.sync(() => window.dispatchEvent(new PopStateEvent("popstate")))
      yield* Effect.sleep("10 millis")

      expect((yield* router.location.get).pathname).toBe("/settings/billing")

      yield* router.back

      expect(wentBack.mock.calls).toHaveLength(1)
      scrolled.mockRestore()
      wentBack.mockRestore()
    }).pipe(Effect.provide(Layer.fresh(Router.Router.layerBrowser))),
  )
})
