import { fireEvent, within } from "@testing-library/dom"
import { Effect, Layer, Option, Schema } from "effect"
import type { Scope } from "effect"
import * as App from "../App.ts"
import * as Renderer from "../Renderer.ts"
import { page } from "../renderer/memory.ts"
import type * as View from "../View.ts"
import * as Diagnostics from "./said.ts"
import { OnBrowserScheduler } from "./soon.ts"

export class NotSettled extends Schema.TaggedError<NotSettled, { readonly brand: unique symbol }>()(
  "NotSettled",
  { rounds: Schema.Int },
) {
  override get message() {
    return Diagnostics.text("SPAR_PLAY_NOT_SETTLED", {
      said: `The page kept changing for ${this.rounds} rounds and never settled.`,
    })
  }
}

export class NotOnPage extends Schema.TaggedError<NotOnPage, { readonly brand: unique symbol }>()(
  "NotOnPage",
  { expected: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return Diagnostics.text("SPAR_PLAY_NOT_ON_PAGE", {
      said: `Expected ${this.expected} on the page, and it was not there once the page settled.`,
    })
  }
}

export type Play = {
  readonly body: HTMLElement
  readonly settle: Effect.Effect<void, NotSettled>
  readonly find: (role: string, name?: string) => Effect.Effect<HTMLElement, NotSettled | NotOnPage>
  readonly has: (text: string) => Effect.Effect<boolean, NotSettled>
  readonly click: (role: string, name?: string) => Effect.Effect<void, NotSettled | NotOnPage>
  readonly type: (
    role: string,
    name: string,
    value: string,
  ) => Effect.Effect<void, NotSettled | NotOnPage>
  readonly press: (key: string) => Effect.Effect<void, NotSettled>
}

const quietRounds = 3

const mostRounds = 500

const described = (role: string, name: string | undefined): string =>
  name === undefined ? `a ${role}` : `a ${role} named "${name}"`

const named = (name: string | undefined): { readonly name?: string } =>
  name === undefined ? {} : { name }

type Watch = { readonly seen: string; readonly quiet: number; readonly round: number }

const settledFrom = (body: HTMLElement, watch: Watch): Effect.Effect<void, NotSettled> =>
  Effect.suspend(() => {
    if (watch.round >= mostRounds) return Effect.fail(new NotSettled({ rounds: watch.round }))

    return Effect.flatMap(
      Effect.andThen(
        Effect.yieldNow,
        Effect.sync(() => body.innerHTML),
      ),
      (now) => {
        const quiet = now === watch.seen ? watch.quiet + 1 : 0
        if (quiet >= quietRounds) return Effect.void

        return settledFrom(body, { seen: now, quiet, round: watch.round + 1 })
      },
    )
  })

export const play = Effect.fnUntraced(function* <R>(
  component: View.Component<App.NoProps, never, R>,
): Effect.fn.Return<Play, never, Scope.Scope | Exclude<R, App.Frame>> {
  const memory = page()
  const body = memory.target.ownerDocument.body
  const context = yield* Effect.context<Exclude<R, App.Frame>>()
  const settle = Effect.suspend(() =>
    settledFrom(body, { seen: body.innerHTML, quiet: 0, round: 0 }),
  )
  const found = (role: string, name?: string) =>
    Effect.andThen(
      settle,
      Effect.try({
        try: () => within(body).getByRole(role, named(name)),
        catch: (cause) => new NotOnPage({ expected: described(role, name), cause }),
      }),
    )
  const acted = (role: string, name: string | undefined, act: (element: HTMLElement) => void) =>
    Effect.andThen(
      Effect.flatMap(found(role, name), (element) => Effect.sync(() => act(element))),
      settle,
    )

  yield* Effect.forkScoped(
    Effect.provideService(
      App.mount(component, {
        layer: Layer.merge(
          Layer.succeedContext(context),
          Renderer.into(memory.target, memory.overlays),
        ),
      }),
      OnBrowserScheduler,
      false,
    ),
    { startImmediately: true },
  )
  yield* Effect.orDie(settle)

  return {
    body,
    settle,
    find: found,
    has: (text) =>
      Effect.andThen(
        settle,
        Effect.sync(() => body.textContent.includes(text)),
      ),
    click: (role, name) => acted(role, name, (element) => fireEvent.click(element)),
    type: (role, name, value) =>
      acted(role, name, (element) => fireEvent.input(element, { target: { value } })),
    press: (key) =>
      Effect.andThen(
        Effect.andThen(
          settle,
          Effect.sync(() => {
            Option.map(
              Option.fromNullishOr(memory.target.ownerDocument.activeElement),
              (focused) => {
                fireEvent.keyDown(focused, { key })
                fireEvent.keyUp(focused, { key })
              },
            )
          }),
        ),
        settle,
      ),
  }
})
