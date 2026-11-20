import { Schema } from "effect"
import { Markup, Props, Router, View } from "spar"

export const NavLinkView = View.make(
  "NavLinkView",
  {
    title: Schema.String,
    link: Router.Link,
    current: Props.Reactive(Schema.NullOr(Schema.String)),
  },
  ({ title, link, current }) => (
    <li>
      <a
        href={link.href}
        aria-current={current}
        onClick={link.onClick}
        onPointerenter={link.onIntent}
        onFocus={link.onIntent}
      >
        {title}
      </a>
    </li>
  ),
)

export const NavGroupView = View.make(
  "NavGroupView",
  { title: Schema.String, links: Props.Element },
  ({ title, links }) => (
    <section class="nav-group">
      <h2>{title}</h2>
      <ul>{links}</ul>
    </section>
  ),
)

export const HeadingLinkView = View.make(
  "HeadingLinkView",
  {
    text: Props.Reactive(Schema.String),
    href: Props.Reactive(Schema.String),
    depth: Props.Reactive(Schema.String),
  },
  ({ text, href, depth }) => (
    <li data-depth={depth}>
      <a href={href}>{text}</a>
    </li>
  ),
)

export const HitView = View.make(
  "HitView",
  {
    title: Props.Reactive(Schema.String),
    heading: Props.Reactive(Schema.String),
    excerpt: Props.Reactive(Schema.String),
    href: Props.Reactive(Schema.String),
  },
  ({ title, heading, excerpt, href }) => (
    <li>
      <a href={href}>
        <strong>{heading}</strong>
        <span class="hit-page">{title}</span>
        <span class="hit-excerpt">{excerpt}</span>
      </a>
    </li>
  ),
)

export const DocView = View.make(
  "DocView",
  {
    groups: Schema.Array(Props.Element),
    body: Props.Reactive(Markup.Markup),
    headings: Props.Element,
    problem: Props.Reactive(Schema.String),
    busy: Props.Reactive(Schema.String),
    onLink: Props.Handler("click"),
  },
  ({ groups, body, headings, problem, busy, onLink }) => (
    <div class="doc">
      <nav class="doc-nav" aria-label="Documentation">
        {groups}
      </nav>
      <main class="doc-main" aria-busy={busy}>
        <p class="problem" role="alert">
          {problem}
        </p>
        <article class="prose" markup={body} onClick={onLink} />
      </main>
      <nav class="doc-toc" aria-label="On this page">
        <h2>On this page</h2>
        <ul>{headings}</ul>
      </nav>
    </div>
  ),
)

export const HomeView = View.make(
  "HomeView",
  {
    before: Props.Reactive(Markup.Markup),
    between: Props.Reactive(Markup.Markup),
    after: Props.Reactive(Markup.Markup),
    loads: Props.Element,
    refusals: Props.Element,
    start: Router.Link,
    principles: Router.Link,
    onLink: Props.Handler("click"),
  },
  ({ before, between, after, loads, refusals, start, principles, onLink }) => (
    <main class="home">
      <header class="lead">
        <h1>Spar</h1>
        <p>
          A front-end framework built on Effect, for agents that write front-end code and the people
          who read it. Each design decision below is there to make one kind of bug impossible to
          write, or impossible to miss.
        </p>
        <p class="lead-links">
          <a
            class="spar-button spar-primary"
            href={start.href}
            onClick={start.onClick}
            onPointerenter={start.onIntent}
            onFocus={start.onIntent}
          >
            Getting started
          </a>
          <a
            class="spar-button"
            href={principles.href}
            onClick={principles.onClick}
            onPointerenter={principles.onIntent}
            onFocus={principles.onIntent}
          >
            The principles
          </a>
          <a class="spar-button spar-quiet" href="/llms.txt">
            llms.txt
          </a>
        </p>
      </header>
      <article class="prose" markup={before} onClick={onLink} />
      {loads}
      <article class="prose" markup={between} onClick={onLink} />
      {refusals}
      <article class="prose" markup={after} onClick={onLink} />
    </main>
  ),
)

export const MissingView = View.make("MissingView", { path: Schema.String }, ({ path }) => (
  <main class="home">
    <h1>Nothing here</h1>
    <p role="alert">There is no page at {path}.</p>
  </main>
))

export const SiteView = View.make(
  "SiteView",
  {
    home: Router.Link,
    docs: Router.Link,
    errors: Router.Link,
    text: Props.Reactive(Schema.String),
    onSearch: Props.Handler("input"),
    summary: Props.Reactive(Schema.String),
    searching: Props.Reactive(Schema.Boolean),
    hits: Props.Element,
    page: Props.Element,
  },
  (props) => (
    <div class="site">
      <header class="topbar">
        <a
          class="brand"
          href={props.home.href}
          onClick={props.home.onClick}
          onPointerenter={props.home.onIntent}
          onFocus={props.home.onIntent}
        >
          Spar
        </a>
        <nav class="top-links" aria-label="Site">
          <a
            href={props.docs.href}
            onClick={props.docs.onClick}
            onPointerenter={props.docs.onIntent}
            onFocus={props.docs.onIntent}
          >
            Docs
          </a>
          <a
            href={props.errors.href}
            onClick={props.errors.onClick}
            onPointerenter={props.errors.onIntent}
            onFocus={props.errors.onIntent}
          >
            Error codes
          </a>
          <a href="/devtools/toggle">Devtools on or off</a>
        </nav>
        <search class="search">
          <label>
            <span class="search-label">Search the docs</span>
            <input
              type="search"
              placeholder="Search the docs"
              value={props.text}
              onInput={props.onSearch}
            />
          </label>
          <div class={{ "search-panel": true, open: props.searching }}>
            <p role="status">{props.summary}</p>
            <ul>{props.hits}</ul>
          </div>
        </search>
      </header>
      {props.page}
    </div>
  ),
)
