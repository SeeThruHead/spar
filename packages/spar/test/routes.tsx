import { Reactive } from "spar"
import type { Element, Handle, Router } from "spar"

type ShellProps = {
  readonly home: Router.Link
  readonly welcome: Router.Link
  readonly profile: Router.Link
  readonly main: Handle.Handle
  readonly page: Element
}

export const ShellView = ({ home, welcome, profile, main, page }: ShellProps) => (
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
)

export const HomeView = () => <h1>Home</h1>

export const ThreadView = ({ subject }: { readonly subject: string }) => <h1>{subject}</h1>

export const ThreadLoadingView = ({ id }: { readonly id: string }) => (
  <p role="status">Loading thread {id}</p>
)

type SearchProps = {
  readonly kind: "mail" | "people"
  readonly page?: number | undefined
}

export const SearchView = ({ kind, page }: SearchProps) => (
  <h1>
    Searching {kind}, page {page ?? 1}
  </h1>
)

export const NotFoundView = ({ path }: { readonly path: string }) => (
  <p role="alert">Nothing lives at {path}</p>
)

type SettingsProps = {
  readonly profile: Router.Link
  readonly billing: Router.Link
  readonly section: Element
}

export const SettingsView = ({ profile, billing, section }: SettingsProps) => (
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
)

export const ProfileView = () => <h2>Profile</h2>

export const BillingView = () => <h2>Billing</h2>

type LiveSearchProps = {
  readonly params: Reactive.Reactive<SearchProps>
}

export const LiveSearchView = ({ params }: LiveSearchProps) => (
  <h1>{Reactive.map(params, (now) => `Live ${now.kind}, page ${now.page ?? 1}`)}</h1>
)
