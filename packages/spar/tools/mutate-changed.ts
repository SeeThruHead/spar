const base = Bun.env["MUTATION_BASE"] ?? "origin/main"

const skipped = (path: string): boolean =>
  path.startsWith("src/devtools/") || path === "src/transform/bun.ts"

const changed = (): ReadonlyArray<string> =>
  Bun.spawnSync([
    "git",
    "diff",
    "--name-only",
    "--relative",
    "--diff-filter=AMR",
    `${base}...HEAD`,
    "--",
    "src",
  ])
    .stdout.toString()
    .split("\n")
    .filter((path) => path.endsWith(".ts"))
    .filter((path) => !skipped(path))

const files = changed()

if (files.length === 0) {
  console.log(`No framework source changed since ${base}, so there is nothing to mutate.`)
  process.exit(0)
}

console.log(`Mutating the ${files.length} source files changed since ${base}:\n${files.join("\n")}`)

const run = Bun.spawnSync(["bun", "run", "mutation", "--mutate", files.join(",")], {
  stdout: "inherit",
  stderr: "inherit",
})

process.exit(run.exitCode)
