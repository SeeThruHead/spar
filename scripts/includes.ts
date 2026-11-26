const root = new URL("..", import.meta.url).pathname

const include = /^<<< ([\w./-]+\.(?:ts|tsx|json|css|yml))(?:#(\w+))?[ \t]*$/gm

const topLevel = /^(?:export |const |let |type |class |function |import |declare |interface )/

const languageOf = (path: string): string => path.slice(path.lastIndexOf(".") + 1)

export class MissingInclude extends Error {}

const declared = (lines: ReadonlyArray<string>, name: string, path: string): string => {
  const start = lines.findIndex((line) =>
    new RegExp(`^(?:export )?(?:const|let|type|class|function|interface) ${name}\\b`).test(line),
  )
  if (start < 0) throw new MissingInclude(`${path} has no top-level declaration named ${name}`)

  const next = lines.findIndex((line, index) => index > start && topLevel.test(line))
  const taken = lines.slice(start, next < 0 ? lines.length : next)
  const end = taken.findLastIndex((line) => line.trim() !== "")

  return taken.slice(0, end + 1).join("\n")
}

const excerpt = async (path: string, name: string | undefined): Promise<string> => {
  const file = Bun.file(`${root}${path}`)
  if (!(await file.exists())) throw new MissingInclude(`${path} does not exist`)

  const text = (await file.text()).trimEnd()

  return name === undefined ? text : declared(text.split("\n"), name, path)
}

export const expanded = async (markdown: string): Promise<string> => {
  const found = [...markdown.matchAll(include)]
  const blocks = await Promise.all(
    found.map(async ([, path = "", name]) => {
      const code = await excerpt(path, name)

      return `\`\`\`${languageOf(path)}\n${code}\n\`\`\`\n\n(\`${path}\`)`
    }),
  )

  return found.reduce(
    (text, [whole], index) => text.replace(whole, blocks[index] ?? whole),
    markdown,
  )
}

export const includesIn = (markdown: string): ReadonlyArray<string> =>
  [...markdown.matchAll(include)].map(([whole]) => whole)
