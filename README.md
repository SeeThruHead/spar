# Spar

A UI framework for Effect. A component is a pure JSX view plus one Effect that makes its props. The
Effect runs once when the component mounts; reactive values update single DOM nodes; errors and
required services are part of a component's type and are settled where the app is mounted.

This repo is private and nothing here is published.

## Read

- [Getting started](docs/getting-started.md)
- [Principles](docs/principles.md): what each rule is and what it rules out
- [API](docs/api.md): every module with an example
- [Recipes](docs/recipes.md): timers, sockets, offline, dialogs, testing, tracing
- [Coming from Foldkit](docs/from-foldkit.md) and [coming from React](docs/from-react.md)
- [Benchmarks](docs/benchmarks.md) against Solid and Foldkit
- [What is not done](docs/gaps.md)

`bun run --cwd apps/docs dev` serves the same pages as a site on http://127.0.0.1:4183.

## Run

| Command                             | What it does                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `bun install`                       | Installs everything and the git hooks.                                             |
| `bun run check`                     | Typecheck, lint, format check, unit tests at 100% coverage, forbidden-code proofs. |
| `bun run moon run demo:browser`     | Drives the demo in headless Chromium.                                              |
| `bun run moon run stories:play`     | Plays every component story at three sizes with an accessibility audit.            |
| `bun run moon run sidebar:features` | Runs the proof app's Gherkin scenarios in Chromium.                                |
| `bun run moon run bench:leaks`      | Checks that mounting and unmounting leaves nothing behind.                         |
| `bun run moon run bench:bench`      | Reruns the benchmarks (several minutes) and rewrites `docs/benchmarks.md`.         |
| `bun run --cwd apps/sidebar dev`    | The proof app on http://127.0.0.1:4181.                                            |
| `bun run --cwd apps/stories dev`    | The component stories on http://127.0.0.1:4180.                                    |

## Layout

- `packages/spar`: the framework and `spar/testing`
- `packages/ui`: base components (`@spar/ui`) and their stylesheet
- `packages/lint`: this repo's own lint rules and the commit-message check
- `apps/demo`: the first demo and `forbidden/`, code that must not compile
- `apps/stories`: one page per base component, with play tests
- `apps/sidebar`: the proof app, a port of a real Foldkit screen
- `apps/bench`: the same table app in Spar, Solid and Foldkit, plus the leak test
