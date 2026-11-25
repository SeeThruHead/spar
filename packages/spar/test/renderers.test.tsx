import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Ref, Schedule, Schema } from "effect"
import { App, Renderer, Server, State, Store, compose, withStore } from "spar"
import * as Memory from "spar/renderer/memory"
import * as Terminal from "spar/renderer/terminal"

const Counting = Schema.Struct({ count: Schema.Int })

type Counting = typeof Counting.Type

class Tally extends Store.Tag<Tally>()("test/renderers/Tally", {
  state: Counting,
  initialState: { count: 0 },
  actions: {
    added: Store.action(Schema.Void, (state: Counting): Counting => ({ count: state.count + 1 })),
  },
  selectors: { count: Store.selector(Schema.Int, (state: Counting) => state.count) },
}) {}

const Counter = compose(
  withStore(Tally, (tally) => ({ count: tally.select.count, onAdd: tally.commands.added() })),
)((props) => (
  <section aria-label="Counter">
    <h2>Counter</h2>
    <p>
      Count <output aria-label="Count">{props.count}</output>
    </p>
    <button type="button" onClick={props.onAdd}>
      Add one
    </button>
  </section>
))

const until = <A,>(effect: Effect.Effect<A>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("5 millis") }).pipe(
    Effect.timeout("10 seconds"),
    Effect.orDie,
  )

describe("one component, any renderer chosen by a layer", () => {
  it.live(
    "the same counter draws into a page of its own and into a terminal, and both follow it",
    () =>
      Effect.gen(function* () {
        const store = yield* Layer.build(Tally.layer.pipe(Layer.provideMerge(State.layer)))
        const page = Memory.page()

        expect([page.target.isConnected, page.overlays.isConnected]).toEqual([true, true])

        const frames = yield* Ref.make<ReadonlyArray<string>>([])
        const lastFrame = Effect.map(Ref.get(frames), (all) => all.at(-1) ?? "")
        const html = Effect.sync(() => page.target.innerHTML)

        yield* Effect.forkScoped(
          App.mount(Counter, {
            layer: Layer.merge(
              Layer.succeedContext(store),
              Renderer.into(page.target, page.overlays),
            ),
          }),
        )
        yield* Effect.forkScoped(
          App.mount(Counter, {
            layer: Layer.merge(
              Layer.succeedContext(store),
              Terminal.layer((frame) => Ref.update(frames, (all) => [...all, frame])),
            ),
          }),
        )

        expect(yield* until(html, (now) => now.includes("Count"))).toContain(
          '<output aria-label="Count">0</output>',
        )
        expect(yield* until(lastFrame, (now) => now.includes("Count"))).toBe(
          "Counter\nCount 0\n[ Add one ]",
        )

        yield* Effect.provide(
          Effect.flatMap(Effect.service(Tally), (tally) => tally.commands.added()),
          store,
        )
        yield* until(lastFrame, (now) => now.includes("Count 1"))
        expect(yield* html).toContain('<output aria-label="Count">1</output>')

        yield* Effect.sync(() => page.target.querySelector("button")?.click())
        expect(yield* until(lastFrame, (now) => now.includes("Count 2"))).toBe(
          "Counter\nCount 2\n[ Add one ]",
        )
      }),
    20_000,
  )

  it.live(
    "a server draws text with Renderer.html, and each side says so when given the other",
    () =>
      Effect.gen(function* () {
        const store = Tally.layer.pipe(Layer.provideMerge(State.layer))
        const page = Memory.page()
        const html = yield* Server.renderToString(Counter, {
          layer: Layer.merge(store, Renderer.html),
        })
        const mounted = yield* Effect.exit(
          App.mount(Counter, { layer: Layer.merge(store, Renderer.html) }),
        )
        const served = yield* Effect.exit(
          Server.renderToString(Counter, {
            layer: Layer.merge(store, Renderer.into(page.target, page.overlays)),
          }),
        )

        expect(html).toContain('<output aria-label="Count">0</output>')
        expect(String(mounted)).toContain("not Renderer.html")
        expect(String(served)).toContain("give it Renderer.html")
      }),
  )

  it("prints inputs, buttons and blocks as text a terminal can show", () => {
    const { target } = Memory.page()
    const field = target.ownerDocument.createElement("input")

    const note = target.ownerDocument.createElement("p")

    field.setAttribute("value", "typed")
    note.append("A note", target.ownerDocument.createComment("a marker"))
    target.append(note, field)

    expect(Terminal.frameOf(target)).toBe("A note\n[typed]")
  })
})
