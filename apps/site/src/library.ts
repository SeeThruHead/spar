import { Effect } from "effect"
import { NotKnown } from "./api.ts"
import type { Hit, Page } from "./api.ts"
import type { Content, Section } from "./content.ts"

const wordsOf = (text: string): ReadonlyArray<string> =>
  text
    .toLowerCase()
    .split(/[^a-z0-9_.]+/)
    .filter((word) => word.length > 1)

const countOf = (text: string, word: string): number => text.split(word).length - 1

const scoreOf = (section: Section, words: ReadonlyArray<string>): number => {
  const heading = section.heading.toLowerCase()
  const text = section.text.toLowerCase()
  const each = words.map((word) => countOf(heading, word) * 8 + Math.min(countOf(text, word), 5))

  return each.every((score) => score > 0) ? each.reduce((sum, score) => sum + score, 0) : 0
}

const excerptOf = (section: Section, words: ReadonlyArray<string>): string => {
  const at = Math.max(section.text.toLowerCase().indexOf(words[0] ?? ""), 0)
  const from = Math.max(at - 60, 0)
  const cut = section.text.slice(from, from + 180).trim()

  return `${from > 0 ? "…" : ""}${cut}${from + 180 < section.text.length ? "…" : ""}`
}

export const pageIn =
  (content: Content) =>
  (slug: string): Effect.Effect<Page, NotKnown> =>
    Effect.fromNullishOr(content.pages.find((page) => page.slug === slug)).pipe(
      Effect.mapError(() => new NotKnown({ what: slug })),
    )

export const searchIn =
  (sections: ReadonlyArray<Section>) =>
  (text: string): Effect.Effect<ReadonlyArray<Hit>> =>
    Effect.sync(() => {
      const words = wordsOf(text)
      if (words.length === 0) return []

      return sections
        .map((section) => ({ section, score: scoreOf(section, words) }))
        .filter((scored) => scored.score > 0)
        .toSorted((left, right) => right.score - left.score)
        .slice(0, 8)
        .map(({ section }) => ({
          slug: section.slug,
          title: section.title,
          heading: section.heading,
          anchor: section.anchor,
          excerpt: excerptOf(section, words),
        }))
    })
