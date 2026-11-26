import { Effect, Option, Schema, pipe } from "effect"
import { AsyncResult } from "effect/reactivity"
import {
  Events,
  Markup,
  Props,
  Reactive,
  Router,
  UiState,
  View,
  compose,
  withProps,
  withStore,
} from "spar"
import type { Heading, Hit, Page } from "./api.ts"
import { Ask } from "./Ask.ts"
import { Loads } from "./Loads.ts"
import { entries as pages, groups } from "./nav.ts"
import { StoreDemo } from "./StoreDemo.ts"
import { DocParams, PageQuery, SearchQuery, docRoute, home } from "./Shelves.ts"
import {
  DocView,
  HeadingLinkView,
  HitView,
  HomeView,
  MissingView,
  NavGroupView,
  NavLinkView,
  SiteView,
} from "./SiteView.tsx"

const demo = /<p>\[\[demo:[a-z]+\]\]<\/p>/

const partOf = (page: Page | null, index: number): Markup.Markup =>
  Markup.trusted((page?.html ?? "").split(demo)[index] ?? "")

const said = (status: string, slug: string): string =>
  status === "failed" ? `There is no page called ${slug}.` : ""

const Entry = Schema.Struct({ slug: Schema.String, title: Schema.String })

type Entry = typeof Entry.Type

const groupFields = {
  title: Schema.String,
  entries: Schema.Array(Entry),
  current: Props.Reactive(Schema.String),
}

const NavGroup = compose(
  withProps(groupFields),
  Effect.fnUntraced(function* ({
    title,
    entries,
    current,
  }: Schema.Struct<typeof groupFields>["Type"]) {
    const router = yield* Router.Router

    return {
      title,
      links: yield* pipe(
        Reactive.succeed(entries),
        Reactive.mapBy(
          (entry: Entry) => entry.slug,
          NavLinkView,
          (_entry, slug) => ({
            title: entries.find((entry) => entry.slug === slug)?.title ?? slug,
            link: router.link(docRoute, { slug }),
            current: Reactive.map(current, (now) => (now === slug ? "page" : null)),
          }),
        ),
      ),
    }
  }),
)(NavGroupView)

const docFields = { params: Props.Reactive(DocParams) }

const shownIn = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | null =>
  Option.getOrNull(AsyncResult.value(result))

const statusIn = <A, E>(result: AsyncResult.AsyncResult<A, E>): string =>
  result.waiting
    ? "loading"
    : AsyncResult.match(result, {
        onInitial: () => "waiting",
        onFailure: () => "failed",
        onSuccess: () => "loaded",
      })

const sectionTitle = (slug: string): string =>
  pages.find((entry) => entry.slug === slug)?.title ?? slug

export const titleOf = (page: string | undefined): string =>
  page === undefined ? "Spar" : `${page} · Spar`

const DocPage = compose(
  withProps(docFields),
  Effect.fnUntraced(function* ({ params }: Schema.Struct<typeof docFields>["Type"]) {
    const page = yield* PageQuery.ask(Reactive.map(params, (now) => now.slug))
    const latest = Reactive.map(page.result, shownIn)
    const current = Reactive.map(params, (now) => now.slug)
    const state = yield* Reactive.zip(Reactive.map(page.result, statusIn), current)
    const sectionsOpen = yield* UiState.make("sections open", Schema.Boolean, false)

    yield* Events.title(Reactive.map(latest, (shown) => titleOf(shown?.title)))

    return {
      groups: yield* Effect.forEach(groups, (group) =>
        View.child(NavGroup, { title: group.title, entries: group.entries, current }),
      ),
      body: Reactive.map(latest, (shown) => Markup.trusted(shown?.html ?? "")),
      headings: yield* pipe(
        Reactive.map(latest, (shown) => shown?.headings ?? []),
        Reactive.mapBy(
          (heading: Heading) => heading.id,
          HeadingLinkView,
          (heading) => ({
            text: Reactive.map(heading, (now) => now.text),
            href: Reactive.map(heading, (now) => `#${now.id}`),
            depth: Reactive.map(heading, (now) => String(now.level)),
          }),
        ),
      ),
      problem: Reactive.map(state, ([status, slug]) => said(status, slug)),
      busy: Reactive.map(page.result, (result) => String(result.waiting)),
      section: Reactive.map(current, sectionTitle),
      sectionsOpen,
      sectionsSaid: Reactive.map(sectionsOpen, String),
      onSections: UiState.update(sectionsOpen, (open) => !open),
      onPicked: UiState.set(sectionsOpen, false),
    }
  }),
  withStore(Router.Router, (router) => ({ onLink: router.followLinks })),
)(DocView)

const Home = compose(
  Effect.fnUntraced(function* () {
    const router = yield* Router.Router
    const page = yield* PageQuery.ask("home")

    yield* Events.title(Reactive.succeed(titleOf(undefined)))

    return {
      before: Reactive.map(page.result, (result) => partOf(shownIn(result), 0)),
      between: Reactive.map(page.result, (result) => partOf(shownIn(result), 1)),
      after: Reactive.map(page.result, (result) => partOf(shownIn(result), 2)),
      loads: yield* View.child(Loads, {}),
      store: yield* View.child(StoreDemo, {}),
      ask: yield* View.child(Ask, {}),
      start: router.link(docRoute, { slug: "getting-started" }),
      principles: router.link(docRoute, { slug: "principles" }),
      onLink: router.followLinks,
    }
  }),
)(HomeView)

const wanted = (text: string): Option.Option<string> =>
  text.trim().length < 2 ? Option.none() : Option.some(text.trim())

const summaryOf = (status: string, found: number): string => {
  if (status === "waiting") return ""
  if (status === "loading") return "Searching"
  if (found === 0) return "Nothing matches"

  return found === 1 ? "1 place" : `${found} places`
}

export const Site = compose(
  Effect.fnUntraced(function* () {
    const router = yield* Router.Router
    const text = yield* UiState.make("search", Schema.String, "")
    const hits = yield* SearchQuery.ask(Reactive.map(text, wanted))
    const found = Reactive.map(hits.result, (result) => shownIn(result) ?? [])
    const state = yield* Reactive.zip(Reactive.map(hits.result, statusIn), found)

    return {
      home: router.link(home, {}),
      docs: router.link(docRoute, { slug: "getting-started" }),
      errors: router.link(docRoute, { slug: "diagnostics" }),
      text,
      onSearch: (event: InputEvent) =>
        UiState.set(text, event.target instanceof HTMLInputElement ? event.target.value : ""),
      summary: Reactive.map(state, ([status, all]) => summaryOf(status, all.length)),
      searching: Reactive.map(text, (now) => Option.isSome(wanted(now))),
      hits: yield* pipe(
        found,
        Reactive.mapBy(
          (hit: Hit) => `${hit.slug}#${hit.anchor}`,
          HitView,
          (hit) => ({
            title: Reactive.map(hit, (now) => now.title),
            heading: Reactive.map(hit, (now) => now.heading),
            excerpt: Reactive.map(hit, (now) => now.excerpt),
            href: Reactive.map(hit, (now) => `/docs/${now.slug}#${now.anchor}`),
          }),
        ),
      ),
      page: yield* Router.outlet({
        routes: [Router.on(home, Home), Router.live(docRoute, DocPage)],
        otherwise: MissingView,
      }),
    }
  }),
)(SiteView)
