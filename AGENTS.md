# Spar

An Effect-native UI framework: a component is a pure JSX view plus one Effect that makes its props.
The principles are in `docs/principles.md`. Tickets are in `.tickets/` (`tk ready`).

## Commands

Everything runs through package.json scripts wrapped by moon tasks. Never call a tool binary directly.

| Command                         | What it does                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run check`                 | Every project's typecheck, lint, format check, tests and forbidden-code proofs.                |
| `bun run moon run spar:test`    | Unit and component tests of the core.                                                          |
| `bun run moon run demo:proofs`  | Type checks `apps/demo/forbidden` and runs the JSX build check; fails if any file is accepted. |
| `bun run moon run demo:browser` | Builds the demo and drives it in headless Chromium.                                            |
| `bun run format`                | Formats with oxfmt.                                                                            |

## Layout

- `packages/spar`: the framework. `src/*.ts` are the public modules (View, Reactive, UiState, Store,
  Outbox, App); `src/internal` is the renderer; `src/transform` is the JSX build check and its Bun
  and Vite adapters.
- `packages/lint`: repo hygiene only (house rules as an oxlint plugin, the attribution hook).
- `apps/demo`: the demo app, its browser test, and `forbidden/`, code that must not compile.

## How it starts

`App.mount(component, { target, layer })` is the only entry. It runs the component's Effect once in a
scope, renders the element it returns into `target`, and never completes; interrupting it closes every
scope and clears the target. `Effect.run*` appears only in an app's `src/main.ts` and in scripts.

## What is enforced, and by what

Framework rules are never lint rules. They are type errors, or failures of the JSX build check in
`packages/spar/src/transform/check.ts`, and each has a file in `apps/demo/forbidden` proving it.

The linter covers how this repo's own code is written:

- House rules (`packages/lint/house-rules.ts`): no loops, no `let`, no mutation, no comments, no
  nested `if`, no multi-line logical chains, no casts, no `Date`/`Math.random`, `Effect.run*` only at
  entry points, no function that only returns `Effect.gen`.
- The Effect language service rules through `effect-tsgo`.
- DOM writes live in one module, `packages/spar/src/internal/dom.ts`, the only file where the
  mutation rule is off. The renderer calls it and nothing else touches a node.

## What reviewers check instead

- A view never reaches a service; everything it needs arrives as props.
- Anything acquired (listeners, fibers, sockets, timers) is acquired in a scope owned by a component
  or a layer.
- Public API stays small: one way to do each thing. A new export needs a reason in the docs.
- Tests assert what a user or caller can observe, by role and accessible name, never markup snapshots.
- Every diff is read against the `effect-review` and `code-clarity-review` skills before it is committed.

## Rules for changes

- One commit per ticket. Never publish to npm and never deploy from this repo.
- No AI attribution anywhere; the commit-msg hook and a test enforce it.
