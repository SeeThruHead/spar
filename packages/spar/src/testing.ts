import { fireEvent, screen, waitFor } from "@testing-library/dom"
import { Effect, Layer, Option, Schema, pipe } from "effect"
import type { Scope } from "effect"
import * as App from "./App.ts"
import * as View from "./View.ts"

export class NotOnScreen extends Schema.TaggedError<
  NotOnScreen,
  { readonly brand: unique symbol }
>()("NotOnScreen", { expected: Schema.String, cause: Schema.Defect() }) {
  override get message() {
    return `Expected ${this.expected}, and the screen never showed it.`
  }
}

const described = (role: string, name: string | undefined): string =>
  name === undefined ? `a ${role}` : `a ${role} named "${name}"`

const named = (name: string | undefined): { readonly name?: string } =>
  name === undefined ? {} : { name }

const waitingFor = <A>(expected: string, look: () => Promise<A>): Effect.Effect<A, NotOnScreen> =>
  Effect.tryPromise({ try: look, catch: (cause) => new NotOnScreen({ expected, cause }) })

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

export const render = <Props>(
  view: View.View<Props>,
  props: Props,
): Effect.Effect<void, never, Scope.Scope> =>
  mount(
    pipe(
      view,
      View.mapProps(() => props),
    ),
  )

export const find = (role: string, name?: string): Effect.Effect<HTMLElement, NotOnScreen> =>
  waitingFor(described(role, name), () => screen.findByRole(role, named(name)))

export const findText = (text: string): Effect.Effect<HTMLElement, NotOnScreen> =>
  waitingFor(`the text "${text}"`, () => screen.findByText(text))

class StillOnScreen extends Schema.TaggedError<StillOnScreen, { readonly brand: unique symbol }>()(
  "StillOnScreen",
  {},
) {}

export const eventually = (assertion: () => void): Effect.Effect<void, NotOnScreen> =>
  waitingFor("an assertion to hold", () => waitFor(assertion))

export const gone = (role: string, name?: string): Effect.Effect<void, NotOnScreen> =>
  waitingFor(`no more ${described(role, name)}`, () =>
    waitFor(() => {
      if (screen.queryByRole(role, named(name)) !== null) throw new StillOnScreen()
    }),
  )

export const click = (role: string, name?: string): Effect.Effect<void, NotOnScreen> =>
  Effect.map(find(role, name), (element) => {
    fireEvent.click(element)
  })

export const fill = (role: string, name: string, value: string): Effect.Effect<void, NotOnScreen> =>
  Effect.map(find(role, name), (element) => {
    fireEvent.input(element, { target: { value } })
  })

export const press = (key: string): Effect.Effect<void> =>
  Effect.sync(() => {
    Option.map(Option.fromNullishOr(document.activeElement), (element) => {
      fireEvent.keyDown(element, { key })
      fireEvent.keyUp(element, { key })
    })
  })
