import type { Heading, Page } from "../src/api.ts"
import { entries } from "../src/nav.ts"
import type { Content, Section } from "../src/content.ts"
import { drawing } from "./diagrams.ts"
import type { Drawing } from "./diagrams.ts"
import { highlight, unescaped } from "./highlight.ts"

const root = new URL("..", import.meta.url).pathname

const sources = [
  { slug: "home", title: "Spar", file: `${root}content/home.md` },
  ...entries.map((entry) => ({ ...entry, file: `${root}../../docs/${entry.slug}.md` })),
]

const codeBlock = /<pre><code class="language-([a-z]+)">([\s\S]*?)<\/code><\/pre>/g

const withHighlighting = (html: string): string =>
  html.replace(
    codeBlock,
    (_whole, language: string, code: string) =>
      `<pre><code class="language-${language}">${highlight(unescaped(code))}</code></pre>`,
  )

const withLinks = (html: string): string =>
  html.replace(
    /href="(?:\.\/)?([a-z0-9-]+)\.md(#[^"]*)?"/g,
    (_whole, name: string, anchor?: string) => `href="/docs/${name}${anchor ?? ""}"`,
  )

const plain = (html: string): string =>
  unescaped(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()

const idOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

const heading = /<h([23])>([\s\S]*?)<\/h\1>/g

const withIds = (html: string): string =>
  html.replace(
    heading,
    (_whole, level: string, inner: string) =>
      `<h${level} id="${idOf(plain(inner))}">${inner}</h${level}>`,
  )

const headingsOf = (html: string): ReadonlyArray<Heading> =>
  [...html.matchAll(heading)].map((found) => ({
    id: idOf(plain(found[2] ?? "")),
    text: plain(found[2] ?? ""),
    level: Number(found[1]),
  }))

const sectionsOf = (page: Page): ReadonlyArray<Section> =>
  page.html
    .split(/(?=<h[23] id=")/)
    .map((part) => {
      const found = /^<h[23] id="([^"]*)">([\s\S]*?)<\/h[23]>/.exec(part)

      return {
        slug: page.slug,
        title: page.title,
        heading: found === null ? page.title : plain(found[2] ?? ""),
        anchor: found?.[1] ?? "",
        text: plain(part),
      }
    })
    .filter((section) => section.text.length > 0)

const titleOf = (html: string, fallback: string): string => {
  const found = /<h1>([\s\S]*?)<\/h1>/.exec(html)

  return found === null ? fallback : plain(found[1] ?? "")
}

const pageOf = async (drawn: Drawing, source: (typeof sources)[number]): Promise<Page> => {
  const markdown = await Bun.file(source.file).text()
  const withFigures = await drawn.withDiagrams(Bun.markdown.html(markdown), source.slug)
  const raw = withLinks(withHighlighting(withFigures))

  return {
    slug: source.slug,
    title: source.slug === "home" ? source.title : titleOf(raw, source.title),
    html: withIds(raw),
    headings: headingsOf(raw),
  }
}

export const built = async (): Promise<Content> => {
  const drawn = await drawing()
  const pages = await sources
    .reduce<Promise<ReadonlyArray<Page>>>(
      (all, source) => all.then(async (done) => [...done, await pageOf(drawn, source)]),
      Promise.resolve([]),
    )
    .finally(() => drawn.close())

  return {
    pages,
    sections: pages.filter((page) => page.slug !== "home").flatMap(sectionsOf),
  }
}
