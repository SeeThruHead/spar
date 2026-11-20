import { describe, expect, it, vi } from "@effect/vitest"
import { fireEvent } from "@testing-library/dom"
import { Context, Effect, Latch, Layer, Option, Ref, Schema, pipe } from "effect"
import { Handle, Markup, Props, Router, Timeline, View, compose, withProps, withStore } from "spar"
import { jsx } from "spar/jsx-runtime"
import * as Cell from "../src/internal/cell.ts"
import * as Spans from "spar/devtools/spans"
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

const linked = Markup.trusted(
  [
    '<a href="/threads/inside">In</a>',
    '<a href="https://elsewhere.test/x">Out</a>',
    '<a href="#part">Part</a>',
    '<a href="/settings/billing" target="_blank">New tab</a>',
    '<a href="/report.csv" download>Save</a>',
    '<a href="/?page=2#top">Next page</a>',
    '<a href="/threads/other#top">Other</a>',
    "<p>Plain words</p>",
  ].join(" "),
)

const click = (name: string, init: MouseEventInit = {}) =>
  Effect.flatMap(Testing.find("link", name), (link) =>
    Effect.sync(() => fireEvent.click(link, init)),
  )

const Article = compose(withStore(Router.Router, (router) => ({ onClick: router.followLinks })))(
  (props) => jsx("article", { onClick: props.onClick, markup: linked }),
)
const thread = Router.route("/threads/:id", Schema.Struct({ id: Schema.String }))
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
    compose(
      withProps({ id: Schema.String }),
      Effect.fnUntraced(function* ({ id }) {
        yield* Ref.update(loads, (all) => [...all, id])
        yield* Latch.whenOpen(server, Effect.void)

        return { subject: `Thread ${id}` }
      }),
    )(ThreadView),
    View.pending(ThreadLoadingView),
  )

const Settings = (mounts: Ref.Ref<number>) =>
  compose(
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
  compose(
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

  it("a route declared under another takes its path from it and must carry its params", () => {
    const tab = Router.under(settings, "/tabs/:tab/*", Schema.Struct({ tab: Schema.String }))
    const field = Router.under(
      tab,
      "/fields/:field",
      Schema.Struct({ tab: Schema.String, field: Schema.String }),
    )

    expect(tab.pattern).toBe("/settings/tabs/:tab/*")
    expect(field.build({ tab: "billing", field: "card" })).toBe(
      "/settings/tabs/billing/fields/card",
    )
    expect(paramsAt(field, "/settings/tabs/billing/fields/card")).toEqual(
      Option.some({ tab: "billing", field: "card" }),
    )
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
      const router = yield* Router.Router
      const focusing = vi.spyOn(HTMLElement.prototype, "focus")

      yield* Testing.click("link", "Settings")
      yield* heading("Profile")
      yield* Testing.eventually(() => expect(document.activeElement?.tagName).toBe("MAIN"))

      expect(focusing.mock.calls.at(-1)).toEqual([])

      yield* router.back
      yield* heading("Home")
      yield* Testing.eventually(() =>
        expect(focusing.mock.calls.at(-1)).toEqual([{ preventScroll: true }]),
      )
      focusing.mockRestore()
    }).pipe(Effect.provide(Router.Router.layerMemory("/"))),
  )

  it.live("a live page stays as it is while only its query changes, and follows it", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const mounts = yield* Ref.make(0)
      const LiveSearch = compose(
        withProps(LiveSearchView.props),
        Effect.fnUntraced(function* (props) {
          yield* Ref.update(mounts, (count) => count + 1)

          return props
        }),
      )(LiveSearchView)

      yield* Testing.mount(
        compose(
          Effect.fnUntraced(function* () {
            return {
              page: yield* Router.outlet({
                routes: [Router.live(search, LiveSearch)],
                otherwise: NotFoundView,
              }),
            }
          }),
        )(View.make("PageView", { page: Props.Element }, ({ page }) => page)),
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

  it.live("links inside trusted markup go in place, and the browser keeps the rest", () =>
    Effect.gen(function* () {
      const router = yield* Router.Router
      const prevented = Cell.make<ReadonlyArray<string>>([])
      const record = (event: Event) => {
        const anchor = event.target instanceof Element ? event.target.closest("a") : null

        prevented.write([...prevented.read(), `${anchor?.textContent}:${event.defaultPrevented}`])
        event.preventDefault()
      }

      yield* Effect.acquireRelease(
        Effect.sync(() => window.addEventListener("click", record)),
        () => Effect.sync(() => window.removeEventListener("click", record)),
      )
      yield* Effect.sync(() => window.history.replaceState(null, "", "/"))
      yield* Testing.mount(Article)
      yield* click("Out")
      yield* click("Part")
      yield* click("New tab")
      yield* click("Save")
      yield* click("In", { ctrlKey: true })
      yield* Effect.flatMap(Testing.findText("Plain words"), (words) =>
        Effect.sync(() => {
          fireEvent.click(words)
          fireEvent.click(words.firstChild ?? words)
        }),
      )
      expect((yield* router.location.get).pathname).toBe("/")
      yield* click("Next page")
      yield* Testing.eventually(() => expect(window.location.search).toBe("?page=2"))
      yield* click("Other")
      yield* Testing.eventually(() => expect(window.location.pathname).toBe("/threads/other"))
      yield* click("In")
      yield* Testing.eventually(() => expect(window.location.pathname).toBe("/threads/inside"))

      expect((yield* router.location.get).pathname).toBe("/threads/inside")
      expect(prevented.read()).toEqual([
        "Out:false",
        "Part:false",
        "New tab:false",
        "Save:false",
        "In:false",
        "undefined:false",
        "undefined:false",
        "Next page:true",
        "Other:true",
        "In:true",
      ])
    }).pipe(Effect.provide(Layer.fresh(Router.Router.layerBrowser))),
  )

  it.live("going back or forward with the browser is a span and a moment in its trace", () =>
    Effect.gen(function* () {
      const noted = yield* Ref.make<ReadonlyArray<Timeline.Noted>>([])
      const spans = yield* Layer.build(Spans.layer())
      const buffer = Context.get(spans, Spans.SpanBuffer)

      yield* Layer.build(Layer.fresh(Router.Router.layerBrowser)).pipe(
        Effect.provide(spans),
        Effect.provideService(
          Timeline.Recorder,
          Option.some((seen: Timeline.Noted) => Ref.update(noted, (all) => [...all, seen])),
        ),
      )
      yield* Effect.sync(() => window.history.replaceState(null, "", "/settings/profile?tab=2"))
      yield* Effect.sync(() => window.dispatchEvent(new PopStateEvent("popstate")))
      yield* Effect.sleep("10 millis")

      const [route] = yield* Ref.get(noted)
      const [span] = buffer.recent().filter((each) => each.name === "Router.popstate")

      expect([route?.kind, route?.name, route?.detail]).toEqual([
        "route",
        "/settings/profile?tab=2",
        "history",
      ])
      expect(route?.traceId).toHaveLength(32)
      expect([span?.traceId, span?.spanId]).toEqual([route?.traceId, route?.spanId])
      expect([span?.parentSpanId, span?.attributes["spar.url"]]).toEqual([
        null,
        "/settings/profile?tab=2",
      ])
    }),
  )
})
