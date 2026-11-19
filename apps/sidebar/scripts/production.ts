import { Glob } from "bun"

const dist = new URL("../dist/", import.meta.url).pathname

const marks = [
  "spar/Devtools/Registry",
  "data-spar-devtools",
  "Everything that happened",
  "Timeline position",
]

const files = [...new Glob("**/*.{js,html,css}").scanSync(dist)]

const found = (
  await Promise.all(
    files.map(async (file) => {
      const text = await Bun.file(`${dist}${file}`).text()

      return marks.filter((mark) => text.includes(mark)).map((mark) => `${file}: ${mark}`)
    }),
  )
).flat()

if (files.length === 0) {
  console.error("There is no production build to look at in dist/")
  process.exit(1)
}

if (found.length > 0) {
  console.error(`The production build carries devtools code:\n${found.join("\n")}`)
  process.exit(1)
}

console.log(`No devtools code in the production build (${files.length} files looked at)`)
