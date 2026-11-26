import { Effect, Layer } from "effect"
import { starter } from "../internal/listen.ts"
import { Renderer } from "../Renderer.ts"
import { page } from "./memory.ts"

const blocks = new Set([
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
])

const inside = (node: Node): string => Array.from(node.childNodes, written).join("")

const shownAs = (element: Element): string => {
  if (element.localName === "button") return `[ ${inside(element).trim()} ] `
  if (element.localName === "input") return `[${String(Reflect.get(element, "value"))}]`
  if (blocks.has(element.localName)) return `\n${inside(element)}\n`

  return inside(element)
}

const isElement = (node: Node): node is Element => node.nodeType === 1

const isText = (node: Node): node is Text => node.nodeType === 3

function written(node: Node): string {
  if (isElement(node)) return shownAs(node)

  return isText(node) ? node.data : ""
}

export const frameOf = (target: Node): string =>
  written(target)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n")

export const layer = <R>(print: (frame: string) => Effect.Effect<void, never, R>) =>
  Layer.effect(
    Renderer,
    Effect.gen(function* () {
      const { window, target, overlays } = page()
      const services = yield* Effect.context<R>()
      const start = yield* starter()
      const Observer: typeof MutationObserver = Reflect.get(window, "MutationObserver")
      const observer = new Observer(() => {
        start(Effect.provideContext(print(frameOf(target)), services))
      })

      yield* Effect.acquireRelease(
        Effect.sync(() =>
          observer.observe(target, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
          }),
        ),
        () => Effect.sync(() => observer.disconnect()),
      )

      return Renderer.of({ _tag: "Live", target, overlays, inPage: false })
    }),
  )
