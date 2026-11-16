import { chromium } from "playwright"
import type { Page } from "playwright"
import { highlight, unescaped } from "./highlight.ts"

type Doc = { readonly file: string; readonly title: string }

type Drawn = {
  readonly svg: string
  readonly natural: number
  readonly fontSize: number
}

const root = new URL("..", import.meta.url).pathname

const source = `${root}../../docs/`

const docs: ReadonlyArray<Doc> = [
  { file: "getting-started", title: "Getting started" },
  { file: "principles", title: "Principles" },
  { file: "api", title: "API" },
  { file: "recipes", title: "Recipes" },
  { file: "from-foldkit", title: "Coming from Foldkit" },
  { file: "from-react", title: "Coming from React" },
  { file: "benchmarks", title: "Benchmarks" },
  { file: "gaps", title: "What is not done" },
]

const narrow = 500

const smallestText = 13

const style = `
:root { color-scheme: light; --text: #14181f; --soft: #4a5463; --line: #d5dae2; --paper: #ffffff; --wash: #f4f6f9; --link: #0b5f91; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.55 Inter, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--text); background: var(--paper); }
.site { display: grid; grid-template-columns: 15rem minmax(0, 1fr); min-height: 100vh; }
nav { padding: 1.25rem 1rem; background: var(--wash); border-inline-end: 1px solid var(--line); }
nav p { margin: 0 0 0.75rem; font-weight: 700; }
nav a { display: block; padding: 0.4rem 0.5rem; color: var(--text); text-decoration: none; border-radius: 0.375rem; }
nav a[aria-current="page"] { background: var(--paper); font-weight: 600; outline: 1px solid var(--line); }
nav a:hover { text-decoration: underline; }
main { padding: 1.5rem 2rem 4rem; max-width: 56rem; min-width: 0; }
h1 { font-size: 1.7rem; margin: 0 0 1rem; }
h2 { font-size: 1.3rem; margin: 2.2rem 0 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--line); }
h3 { font-size: 1.05rem; margin: 1.6rem 0 0.4rem; }
a { color: var(--link); }
code { font: 0.9em/1.5 "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--wash); padding: 0.1em 0.3em; border-radius: 0.25rem; }
pre { margin: 1rem 0; padding: 0.9rem 1rem; overflow-x: auto; background: #151b26; color: #e6ebf2; border-radius: 0.5rem; }
pre code { background: none; padding: 0; color: inherit; font-size: 0.875rem; }
table { border-collapse: collapse; margin: 1rem 0; display: block; overflow-x: auto; max-width: 100%; }
th, td { padding: 0.4rem 0.7rem; border: 1px solid var(--line); text-align: start; vertical-align: top; }
th { background: var(--wash); }
figure.diagram { margin: 1.25rem 0; padding: 0.75rem; border: 1px solid var(--line); border-radius: 0.5rem; background: var(--paper); }
figure.diagram svg { display: block; width: 100%; height: auto; max-height: calc(100vh - 200px); }
@media (max-width: 760px) {
  .site { grid-template-columns: minmax(0, 1fr); }
  nav { border-inline-end: 0; border-bottom: 1px solid var(--line); }
  nav a { display: inline-block; }
  main { padding: 1rem 1rem 3rem; }
}
`

const family = "Inter, -apple-system, Segoe UI, Roboto, sans-serif"

const theme = {
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
  drawn.fontSize * Math.min(1, (narrow - 26) / Math.max(drawn.natural, 1))

const checked = (drawn: Drawn, where: string): Drawn => {
  if (!drawn.svg.includes("<svg")) throw new Error(`${where}: the diagram did not render`)
  if (effective(drawn) < smallestText) {
    throw new Error(
      `${where}: text would be ${effective(drawn).toFixed(1)}px at ${narrow}px wide (it is ${drawn.natural}px across); shorten labels or stack it`,
    )
  }

  return drawn
}

const figure = (drawn: Drawn): string =>
  `<figure class="diagram">${drawn.svg.replace(/(<svg[^>]*?)\sstyle="[^"]*"/, "$1").replace(/(<svg[^>]*?)\swidth="[^"]*"/, "$1")}</figure>`

const codeBlock = /<pre><code class="language-([a-z]+)">([\s\S]*?)<\/code><\/pre>/g

const withDiagrams = async (page: Page, html: string, file: string): Promise<string> => {
  const blocks = [...html.matchAll(codeBlock)].filter((found) => found[1] === "mermaid")
  const drawn = await blocks.reduce<Promise<ReadonlyArray<Drawn>>>(
    (all, found, index) =>
      all.then(async (done) => [
        ...done,
        checked(
          await draw(page, unescaped(found[2] ?? ""), `${file}-diagram-${index}`),
          `${file}.md diagram ${index + 1}`,
        ),
      ]),
    Promise.resolve([]),
  )

  return blocks.reduce(
    (text, found, index) =>
      text.replace(found[0], () => figure(drawn[index] ?? { svg: "", natural: 0, fontSize: 0 })),
    html,
  )
}

const withHighlighting = (html: string): string =>
  html.replace(
    codeBlock,
    (_whole, language: string, code: string) =>
      `<pre><code class="language-${language}">${highlight(unescaped(code))}</code></pre>`,
  )

const withLinks = (html: string): string =>
  html.replace(
    /href="(?:\.\/)?([a-z-]+)\.md(#[^"]*)?"/g,
    (_whole, name: string, anchor?: string) => `href="${name}.html${anchor ?? ""}"`,
  )

const layout = (doc: Doc, body: string): string =>
  [
    "<!doctype html>",
    '<html lang="en">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${doc.title} · Spar</title><style>${style}</style></head>`,
    '<body><div class="site">',
    `<nav aria-label="Documentation"><p>Spar</p>${docs
      .map(
        (each) =>
          `<a href="${each.file}.html"${each.file === doc.file ? ' aria-current="page"' : ""}>${each.title}</a>`,
      )
      .join("")}</nav>`,
    `<main>${body}</main>`,
    "</div></body>",
    "</html>",
  ].join("\n")

const browser = await chromium.launch()
const page = await browser.newPage()

await page.setContent("<!doctype html><html><body></body></html>")
await page.addScriptTag({ path: Bun.resolveSync("mermaid/dist/mermaid.min.js", root) })
await page.evaluate((config) => {
  const mermaid: unknown = Reflect.get(globalThis, "mermaid")
  const initialize: unknown = Reflect.get(mermaid ?? {}, "initialize")
  if (typeof initialize === "function") Reflect.apply(initialize, mermaid, [config])
}, theme)

const pages = await docs
  .reduce<Promise<ReadonlyArray<readonly [Doc, string]>>>(
    (all, doc) =>
      all.then(async (done) => {
        const markdown = await Bun.file(`${source}${doc.file}.md`).text()
        const html = withLinks(
          withHighlighting(await withDiagrams(page, Bun.markdown.html(markdown), doc.file)),
        )

        return [...done, [doc, layout(doc, html)] as const]
      }),
    Promise.resolve([]),
  )
  .finally(() => browser.close())

await Promise.all(pages.map(([doc, html]) => Bun.write(`${root}dist/${doc.file}.html`, html)))
await Bun.write(`${root}dist/index.html`, pages[0]?.[1] ?? "")

const diagrams = pages.reduce(
  (count, [, html]) => count + html.split('<figure class="diagram">').length - 1,
  0,
)

console.log(`Built ${pages.length} pages with ${diagrams} diagrams into dist/`)
