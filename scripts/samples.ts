const root = new URL("..", import.meta.url).pathname

const pages = [
  ...[...new Bun.Glob("docs/*.md").scanSync(root)].toSorted(),
  "apps/site/content/home.md",
]

const sample = /```tsx?\n((?:(?!```)[\s\S])*?)\n```\n+\(`([^`]+\.tsx?)`\)/g

const flat = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/yield \* /g, "yield* ")
    .trim()

type Found = { readonly page: string; readonly file: string; readonly first: string }

const missing = async (page: string): Promise<ReadonlyArray<Found>> => {
  const text = await Bun.file(`${root}${page}`).text()
  const found = [...text.matchAll(sample)]
  const checked = await Promise.all(
    found.map(async ([, code = "", file = ""]) => {
      const source = Bun.file(`${root}${file}`)
      const there = (await source.exists()) ? flat(await source.text()) : ""

      const absent = code
        .split(/\n\s*\n/)
        .filter((part) => flat(part) !== "...")
        .filter((part) => !there.includes(flat(part)))

      return absent.map((part) => ({ page, file, first: part.split("\n")[0] ?? "" }))
    }),
  )

  return checked.flat()
}

const counted = async (page: string): Promise<number> =>
  [...(await Bun.file(`${root}${page}`).text()).matchAll(sample)].length

const problems = (await Promise.all(pages.map(missing))).flat()
const total = (await Promise.all(pages.map(counted))).reduce((sum, count) => sum + count, 0)

if (problems.length > 0) {
  console.error(
    problems
      .map(
        (problem) =>
          `${problem.page}: the sample starting "${problem.first}" is not in ${problem.file}`,
      )
      .join("\n"),
  )
  process.exit(1)
}

console.log(`All ${total} samples that name a file are in that file`)
