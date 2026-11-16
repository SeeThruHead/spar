import { expect } from "@effect/vitest"
import { screen, waitFor } from "@testing-library/dom"
import { Effect, Layer } from "effect"
import { App } from "spar"
import type { View } from "spar"

export const find = (role: string, name?: string) =>
  Effect.tryPromise(() => screen.findByRole(role, name === undefined ? {} : { name }))

export const findText = (text: string) => Effect.tryPromise(() => screen.findByText(text))

export const eventually = (assertion: () => void) => Effect.tryPromise(() => waitFor(assertion))

export const gone = (role: string) => eventually(() => expect(screen.queryByRole(role)).toBeNull())

export const mount = Effect.fnUntraced(function* <R>(
  component: View.Component<App.NoProps, never, R>,
) {
  const target = yield* Effect.acquireRelease(
    Effect.sync(() => document.body.appendChild(document.createElement("div"))),
    (node) => Effect.sync(() => node.remove()),
  )
  const context = yield* Effect.context<R>()

  yield* Effect.forkScoped(App.mount(component, { target, layer: Layer.succeedContext(context) }), {
    startImmediately: true,
  })
})
