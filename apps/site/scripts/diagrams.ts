import { chromium } from "playwright"
import type { Page } from "playwright"
import { unescaped } from "./highlight.ts"

type Drawn = {
  readonly svg: string
  readonly natural: number
  readonly fontSize: number
}

const root = new URL("..", import.meta.url).pathname

const narrowest = 358

const smallestText = 13

const family = "Inter, -apple-system, Segoe UI, Roboto, sans-serif"

const config = {
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    fontFamily: family,
    fontSize: "16px",
    primaryColor: "#f5f5f5",
    primaryTextColor: "#0a0d12",
    primaryBorderColor: "#717680",
    lineColor: "#414651",
    actorBkg: "#f5f5f5",
    actorBorder: "#717680",
    actorTextColor: "#0a0d12",
    actorLineColor: "#a4a7ae",
    signalColor: "#414651",
    signalTextColor: "#181d27",
    noteBkgColor: "#f5f5f5",
    noteBorderColor: "#717680",
    noteTextColor: "#181d27",
  },
  sequence: {
    actorMargin: 44,
    width: 80,
    height: 34,
    messageMargin: 30,
    boxMargin: 4,
    noteMargin: 14,
    diagramMarginX: 8,
    diagramMarginY: 20,
    messageFontSize: 16,
    noteFontSize: 16,
    actorFontSize: 16,
    messageFontFamily: family,
    noteFontFamily: family,
    actorFontFamily: family,
    wrap: false,
  },
  flowchart: { nodeSpacing: 28, rankSpacing: 32, padding: 10 },
}

const draw = (page: Page, code: string, id: string): Promise<Drawn> =>
  page.evaluate(
    async ({ text, name }) => {
      const mermaid: unknown = Reflect.get(globalThis, "mermaid")
      const render: unknown = Reflect.get(mermaid ?? {}, "render")
      const made: unknown = typeof render === "function" ? await render(name, text) : {}
      const svg = String(Reflect.get(made ?? {}, "svg") ?? "")
      const holder = document.createElement("div")

      holder.insertAdjacentHTML("beforeend", svg)
      document.body.append(holder)

      const drawn = holder.querySelector("svg")
      const label = holder.querySelector("text, .nodeLabel, .messageText")
      const natural = drawn?.viewBox.baseVal.width ?? 0
      const fontSize = label === null ? 0 : Number.parseFloat(getComputedStyle(label).fontSize)

      holder.remove()

      return { svg, natural, fontSize }
    },
    { text: code, name: id },
  )

const effective = (drawn: Drawn): number =>
  drawn.fontSize * Math.min(1, narrowest / Math.max(drawn.natural, 1))

const checked = (drawn: Drawn, where: string): Drawn => {
  if (!drawn.svg.includes("<svg")) throw new Error(`${where}: the diagram did not render`)
  if (effective(drawn) < smallestText) {
    throw new Error(
      `${where}: text would be ${effective(drawn).toFixed(1)}px on a phone (the diagram is ${drawn.natural}px across); shorten labels or stack it`,
    )
  }

  return drawn
}

const figure = (drawn: Drawn): string =>
  `<figure class="diagram">${drawn.svg
    .replace(/(<svg[^>]*?)\sstyle="[^"]*"/, "$1")
    .replace(/(<svg[^>]*?)\swidth="[^"]*"/, "$1")}</figure>`

const mermaidBlock = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g

const nextMermaidBlock = /<pre><code class="language-mermaid">[\s\S]*?<\/code><\/pre>/

export type Drawing = {
  readonly withDiagrams: (html: string, slug: string) => Promise<string>
  readonly close: () => Promise<void>
}

const drawnIn = (page: Page) => async (html: string, slug: string) => {
  const blocks = [...html.matchAll(mermaidBlock)]
  const drawn = await blocks.reduce<Promise<ReadonlyArray<Drawn>>>(
    (all, found, index) =>
      all.then(async (done) => [
        ...done,
        checked(
          await draw(page, unescaped(found[1] ?? ""), `${slug}-diagram-${index}`),
          `${slug} diagram ${index + 1}`,
        ),
      ]),
    Promise.resolve([]),
  )
  const figures = drawn.map(figure)

  return figures.reduce((text, made) => text.replace(nextMermaidBlock, () => made), html)
}

export const drawing = async (): Promise<Drawing> => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.addScriptTag({ path: Bun.resolveSync("mermaid/dist/mermaid.min.js", root) })
  await page.evaluate((given) => {
    const mermaid: unknown = Reflect.get(globalThis, "mermaid")
    const initialize: unknown = Reflect.get(mermaid ?? {}, "initialize")
    if (typeof initialize === "function") Reflect.apply(initialize, mermaid, [given])
  }, config)

  return { withDiagrams: drawnIn(page), close: () => browser.close() }
}
