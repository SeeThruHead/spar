import { Schema } from "effect"
import { Props, Reactive, Router, View } from "spar"

export const ShellView = View.make(
  "ShellView",
  {
    home: Router.Link,
    welcome: Router.Link,
    profile: Router.Link,
    main: Props.Handle,
    page: Props.Element,
  },
  ({ home, welcome, profile, main, page }) => (
    <div>
      <nav aria-label="Main">
        <a href={home.href} onClick={home.onClick}>
          Home
        </a>
        <a href={welcome.href} onClick={welcome.onClick}>
          Welcome thread
        </a>
        <a href={profile.href} onClick={profile.onClick}>
          Settings
        </a>
      </nav>
      <main ref={main} tabIndex={-1}>
        {page}
      </main>
    </div>
  ),
)

export const HomeView = View.make("HomeView", {}, () => <h1>Home</h1>)

export const ThreadView = View.make("ThreadView", { subject: Schema.String }, ({ subject }) => (
  <h1>{subject}</h1>
))

export const ThreadLoadingView = View.make("ThreadLoadingView", { id: Schema.String }, ({ id }) => (
  <p role="status">Loading thread {id}</p>
))

const SearchProps = Schema.Struct({
  kind: Schema.Literals(["mail", "people"]),
  page: Schema.optional(Schema.Finite),
})

export const SearchView = View.make(
  "SearchView",
  {
    kind: Schema.Literals(["mail", "people"]),
    page: Schema.optional(Schema.UndefinedOr(Schema.Finite)),
  },
  ({ kind, page }) => (
    <h1>
      Searching {kind}, page {page ?? 1}
    </h1>
  ),
)

export const NotFoundView = View.make("NotFoundView", { path: Schema.String }, ({ path }) => (
  <p role="alert">Nothing lives at {path}</p>
))

export const SettingsView = View.make(
  "SettingsView",
  { profile: Router.Link, billing: Router.Link, section: Props.Element },
  ({ profile, billing, section }) => (
    <section aria-label="Settings">
      <h1>Settings</h1>
      <a href={profile.href} onClick={profile.onClick}>
        Profile
      </a>
      <a href={billing.href} onClick={billing.onClick}>
        Billing
      </a>
      {section}
    </section>
  ),
)

export const ProfileView = View.make("ProfileView", {}, () => <h2>Profile</h2>)

export const BillingView = View.make("BillingView", {}, () => <h2>Billing</h2>)

export const LiveSearchView = View.make(
  "LiveSearchView",
  { params: Props.Reactive(SearchProps) },
  ({ params }) => (
    <h1>{Reactive.map(params, (now) => `Live ${now.kind}, page ${now.page ?? 1}`)}</h1>
  ),
)
