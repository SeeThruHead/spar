import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Ref, Schedule, Scope } from "effect"
import { Renderer } from "spar"
import { frameOf, layer } from "../src/renderer/terminal.ts"

const blockTags = [
  "article",
  "div",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "header",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "table",
  "tr",
  "ul",
]

const element = (tag: string, children: ReadonlyArray<Node | string> = []): HTMLElement => {
  const made = document.createElement(tag)

  made.append(...children)

  return made
}

describe("a terminal frame", () => {
  it("puts every block on its own line and keeps inline text on the line it is in", () => {
    const root = element(
      "span",
      blockTags.flatMap((tag) => ["before ", element(tag, [tag]), " after"]),
    )

    expect(frameOf(root).split("\n")).toEqual([
      "before",
      ...blockTags.flatMap((tag) => [tag, "afterbefore"]).slice(0, -1),
      "after",
    ])
  })

  it("draws a button in brackets, an input as its value, and leaves out comments", () => {
    const input = element("input")

    Reflect.set(input, "value", "tea")

    const root = element("p", [
      element("button", ["  Save  "]),
      element("em", ["now"]),
      input,
      document.createComment("not shown"),
    ])

    expect(frameOf(root)).toBe("[ Save ] now[tea]")
  })

  it("trims each line and drops the empty ones", () => {
    expect(
      frameOf(element("div", ["   ", element("p", ["  one  "]), "  ", element("p", ["two"])])),
    ).toBe("one\ntwo")
  })
})

const until = <A>(effect: Effect.Effect<A>, holds: (value: A) => boolean) =>
  Effect.repeat(effect, { until: holds, schedule: Schedule.spaced("5 millis") }).pipe(
    Effect.timeout("10 seconds"),
    Effect.orDie,
  )

describe("the terminal renderer", () => {
  it.live("prints a frame when text or an attribute changes, and stops when its scope closes", () =>
    Effect.gen(function* () {
      const frames = yield* Ref.make<ReadonlyArray<string>>([])
      const scope = yield* Scope.make()
      const context = yield* Layer.buildWithScope(
        layer((frame) => Ref.update(frames, (all) => [...all, frame])),
        scope,
      )
      const renderer = context.mapUnsafe.get(Renderer.Renderer.key)
      const target: HTMLElement = Reflect.get(renderer, "target")
      const text = target.ownerDocument.createTextNode("one")

      target.append(text)
      yield* until(Ref.get(frames), (all) => all.at(-1) === "one")

      Reflect.set(text, "data", "two")
      yield* until(Ref.get(frames), (all) => all.at(-1) === "two")

      const before = (yield* Ref.get(frames)).length

      target.setAttribute("data-seen", "yes")
      yield* until(Ref.get(frames), (all) => all.length > before)

      yield* Scope.close(scope, Exit.void)

      const closed = (yield* Ref.get(frames)).length

      Reflect.set(text, "data", "three")
      yield* Effect.sleep("50 millis")

      expect((yield* Ref.get(frames)).length).toBe(closed)
      expect(Reflect.get(renderer, "inPage")).toBe(false)
    }),
  )

  it.live("closes what a print opened when that print ends, not when the renderer goes", () =>
    Effect.gen(function* () {
      const lines = yield* Ref.make<ReadonlyArray<string>>([])
      const noted = (line: string) => Ref.update(lines, (all) => [...all, line])
      const context = yield* Layer.build(
        layer((frame) =>
          Effect.acquireRelease(noted(`opened ${frame}`), () => noted(`closed ${frame}`)),
        ),
      )
      const renderer = context.mapUnsafe.get(Renderer.Renderer.key)
      const target: HTMLElement = Reflect.get(renderer, "target")

      target.append(target.ownerDocument.createTextNode("one"))

      expect(yield* until(Ref.get(lines), (all) => all.length === 2)).toEqual([
        "opened one",
        "closed one",
      ])
    }).pipe(Effect.scoped),
  )
})
