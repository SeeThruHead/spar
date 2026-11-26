import { expanded, includesIn } from "./includes.ts"

const root = new URL("..", import.meta.url).pathname
const src = `${root}packages/spar/src/`

const pages = [
  ...[...new Bun.Glob("docs/*.md").scanSync(root)].toSorted(),
  "apps/site/content/home.md",
]

const sample = /```tsx?\n((?:(?!```)[\s\S])*?)\n```\n+\(`([^`]+\.tsx?)`\)/g

const anySample = /```tsx?\n((?:(?!```)[\s\S])*?)\n```/g

const flat = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .replace(/yield \* /g, "yield* ")
    .trim()

const missing = async (page: string): Promise<ReadonlyArray<string>> => {
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

      return absent.map(
        (part) => `${page}: the sample starting "${part.split("\n")[0] ?? ""}" is not in ${file}`,
      )
    }),
  )

  return checked.flat()
}

const exportsOf = async (file: string): Promise<ReadonlySet<string>> => {
  const text = await Bun.file(`${src}${file}.ts`).text()
  const declared = [
    ...text.matchAll(/^export (?:declare )?(?:const|function|class|type|let)\s+(\w+)/gm),
  ].map((match) => match[1] ?? "")
  const listed = [...text.matchAll(/^export (?:type )?\{([^}]*)\}/gm)].flatMap((match) =>
    (match[1] ?? "").split(",").map(
      (part) =>
        part
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .at(-1) ?? "",
    ),
  )

  return new Set([...declared, ...listed])
}

const index = await Bun.file(`${src}index.ts`).text()
const modules = [...index.matchAll(/^export \* as (\w+) from "\.\/(\w+)\.ts"/gm)]
const known = new Map(
  await Promise.all(
    modules.map(async ([, name = "", file = ""]) => [name, await exportsOf(file)] as const),
  ),
)
const reference = new RegExp(`\\b(${[...known.keys()].join("|")})\\.([A-Za-z]\\w*)`, "g")

const declaresItself = (code: string, name: string): boolean =>
  new RegExp(`\\b(?:const|class|type|import)\\s+(?:\\{[^}]*)?\\b${name}\\b`).test(code)

const unknownNames = async (page: string): Promise<ReadonlyArray<string>> => {
  const text = await Bun.file(`${root}${page}`).text()

  return [...text.matchAll(anySample)].flatMap(([, code = ""]) =>
    [...code.matchAll(reference)]
      .filter(([, module = ""]) => !declaresItself(code, module))
      .filter(([, module = "", name = ""]) => !known.get(module)?.has(name))
      .map(([whole]) => `${page}: a sample uses ${whole}, which spar does not export`),
  )
}

const handWritten = async (page: string): Promise<ReadonlyArray<string>> => {
  const text = await Bun.file(`${root}${page}`).text()

  return [...text.matchAll(anySample)].map((found) => {
    const line = text.slice(0, found.index).split("\n").length

    return `${page}:${line}: TypeScript written by hand. Put it in a file that is type-checked and tested, and show it with <<< path#Name`
  })
}

const brokenIncludes = async (page: string): Promise<ReadonlyArray<string>> =>
  expanded(await Bun.file(`${root}${page}`).text()).then(
    () => [],
    (problem: unknown) => [`${page}: ${String(problem)}`],
  )

const included = async (page: string): Promise<number> =>
  includesIn(await Bun.file(`${root}${page}`).text()).length

const problems = [
  ...(await Promise.all(pages.map(missing))).flat(),
  ...new Set((await Promise.all(pages.map(unknownNames))).flat()),
  ...(await Promise.all(pages.map(handWritten))).flat(),
  ...(await Promise.all(pages.map(brokenIncludes))).flat(),
]
const total = (await Promise.all(pages.map(included))).reduce((sum, count) => sum + count, 0)

if (problems.length > 0) {
  console.error(problems.join("\n"))
  process.exit(1)
}

console.log(
  `All ${total} samples are included from code, and every include points at a declaration`,
)
