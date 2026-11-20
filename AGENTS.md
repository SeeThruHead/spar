# Spar

An Effect-native UI framework: a component is a pure JSX view plus one Effect that makes its props.
The principles are in `docs/principles.md`. Tickets are in `.tickets/` (`tk ready`).

## Commands

Everything runs through package.json scripts wrapped by moon tasks. Never call a tool binary directly.
Run one heavy command at a time (`--concurrency 1`).

| Command                                     | What it does                                                                                   |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run check`                             | Every project's typecheck, lint, format check, tests at 100% coverage, forbidden-code proofs.  |
| `bun run moon run spar:test`                | Unit and component tests of the framework.                                                     |
| `bun run moon run demo:proofs`              | Type checks `apps/demo/forbidden` and runs the JSX build check; fails if any file is accepted. |
| `bun run moon run demo:browser`             | Builds the demo and drives it in a real browser, two tabs and offline included.                |
| `bun run moon run stories:play`             | Plays every component story at three sizes with an accessibility audit.                        |
| `bun run moon run sidebar:features`         | The proof app's Gherkin scenarios.                                                             |
| `bun run moon run sidebar:walkthrough`      | Walks the proof app by keyboard at three sizes with an accessibility audit.                    |
| `bun run moon run bench:leaks`              | Checks that mounting and unmounting leaves nothing behind.                                     |
| `bun run moon run bench:memory`             | Fails if 10,000 rows hold more than 1.5 times what Solid holds.                                |
| `bun run moon run bench:bench`              | Reruns the benchmarks and rewrites `docs/benchmarks.md`.                                       |
| `bun run --cwd packages/spar mutation`      | Mutation testing of the framework (long). It rewrites `src` in place and restores it.          |
| `bun run --cwd packages/devtools-mcp start` | The devtools server for agents (MCP at 127.0.0.1:4188/mcp); see docs/api.md.                   |
| `bun run format`                            | Formats with oxfmt.                                                                            |

The four browser suites (demo, stories, features, walkthrough) run in Chromium by default. Put
`SPAR_BROWSER=firefox` or `SPAR_BROWSER=webkit` in front to run them in another engine. On Linux
WebKit runs from the pinned Playwright container through podman
(`packages/browsers/scripts/in.ts` starts and stops it).

## Layout

- `packages/spar`: the framework. `src/*.ts` are the public modules (App, View, Props, Reactive,
  UiState, Store, Outbox, Tabs, Form, Router, Overlay, Handle, Events, Timeline, Server) and
  `src/testing.ts` is `spar/testing`. `src/internal` is the renderer. `src/transform` is the JSX
  build check, the dev transform that names a component's services, and the Bun and Vite adapters.
  The devtools are their own entry points and never part of the main one: `spar/devtools`
  (`src/Devtools.ts`, views in `src/devtools/PanelView.tsx`), `spar/devtools/vite` (the plugin),
  `spar/devtools/entry` and `client` (what the plugin injects), `spar/devtools/spans` and
  `span-routes` (a span buffer for the page or a backend). Both packages are side-effect free on
  purpose: a view is a module-level call, so an unused one only leaves a bundle that way.
- `packages/ui`: base components (`@spar/ui`) and their stylesheet.
- `packages/browsers`: picks the browser engine for the browser suites.
- `packages/devtools-mcp`: a server that lets an agent read and drive a running app over MCP
  (stores, UI state, the one log, components, traces), and the client layer an app uses to link to
  it.
- `packages/lint`: repo hygiene only (house rules as an oxlint plugin, the attribution hook).
- `apps/demo`: the first demo, its browser test, and `forbidden/`, code that must not compile.
- `apps/stories`: one page per base component, with play tests.
- `apps/sidebar`: the proof app. It has a real backend (`src/api.ts` is the shared RPC contract,
  `server/handlers.ts`, `scripts/backend.ts`) and the browser checks that use it:
  `sidebar:devtools` (the tools through the Vite plugin, with screenshots in `artifacts/`),
  `sidebar:traced` (one trace through page and backend) and `sidebar:production` (no devtools
  code in a production build). `test/trace.test.ts` starts the backend as a process.
- `apps/ssr`: the same components on a server and in the browser: `server/` has the server's
  layers and its data, `src/client.ts` the browser's.

In tests that run in happy-dom: send requests with `Bun.fetch` through `FetchHttpClient.Fetch`,
never start a Bun HTTP server inside that environment (start a process), and remember that a
passing test hides its console output.

- `apps/sidebar`: the proof app, a port of a real Foldkit screen, with Gherkin scenarios.
- `apps/ssr`: a small page rendered on a server and taken over in the browser, with a browser test
  that checks none of the server's nodes are made again.
- `apps/site`: the docs site, built with Spar itself and server-rendered (`bun run --cwd apps/site
  dev`, port 4190), with code highlighted and Mermaid diagrams drawn at build time; the build fails
  if diagram text would be under 13px on a phone, and `site:look` walks it at phone and desktop
  sizes in dark and light. It deploys to spar.sthloc.vip from `.gitea/workflows/site.yml`.
- `apps/bench`: the same table app in Spar, Solid and Foldkit, with the leak and memory checks.

## How it starts

`App.mount(component, { target, layer })` is the only entry. It runs the component's Effect once in a
scope, renders the element it returns into `target`, and never completes; interrupting it closes every
scope and clears the target. `Effect.run*` appears only in an app's `src/main.ts` and in scripts.

## How the renderer is built

- Every DOM write is in `src/internal/dom.ts`. The renderer (`src/internal/render.ts`) calls it and
  nothing else touches a node.
- A reactive value is one small object over a synchronous cell (`src/internal/cell.ts`,
  `src/internal/reactive.ts`). A binding subscribes to it directly; there is no fiber per binding.
- Each row of a keyed list owns one list of things to stop and one cell holding its item. The list,
  not each row, is tied to the parent scope. This is what keeps 10,000 rows near Solid's memory, so
  do not add a per-row or per-binding Effect scope, finalizer, or captured context.
- Listeners start actions through one starter made when the app mounts. Actions run in the app's
  scope, so an action that removes its own element still finishes.

## What is enforced, and by what

Framework rules are never lint rules. They are type errors, or failures of the JSX build check in
`packages/spar/src/transform/check.ts`, and each has a file in `apps/demo/forbidden` proving it.

The linter covers how this repo's own code is written:

- House rules (`packages/lint/house-rules.ts`): no loops, no `let`, no mutation, no comments, no
  nested `if`, no multi-line logical chains, no casts, no `Date`/`Math.random`, `Effect.run*` only at
  entry points, no function that only returns `Effect.gen`.
- The Effect language service rules through `effect-tsgo`.
- Mutation is allowed in two files only, `src/internal/dom.ts` and `src/internal/cell.ts`. A class
  constructor may set its own fields; nothing else may assign to a property.

## What reviewers check instead

- A view never reaches a service; everything it needs arrives as props.
- Anything acquired (listeners, fibers, sockets, timers) is acquired in a scope owned by a component
  or a layer.
- Nothing the user did is lost: a durable store writes what was asked to the device before it waits
  for anything, and sending goes through the outbox.
- Public API stays small: one way to do each thing. A new export needs a reason in the docs.
- Tests assert what a user or caller can observe, by role and accessible name, never markup snapshots.
- Every diff is read against the `effect-review` and `code-clarity-review` skills before it is committed.

## Rules for changes

- One commit per ticket. Never publish to npm and never deploy from this repo.
- No AI attribution anywhere; the commit-msg hook and a test enforce it.
