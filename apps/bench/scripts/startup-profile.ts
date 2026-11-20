import { chromium } from "playwright"

type ProfileNode = {
  readonly id: number
  readonly callFrame: {
    readonly functionName: string
    readonly url: string
    readonly lineNumber: number
  }
}

type Profile = {
  readonly nodes: ReadonlyArray<ProfileNode>
  readonly samples?: ReadonlyArray<number>
  readonly timeDeltas?: ReadonlyArray<number>
}

type Run = { readonly shown: number; readonly profile: Profile }

type Span = { readonly kind: string; readonly from: number; readonly to: number }

const root = new URL("..", import.meta.url).pathname

const framework = Bun.argv[2] ?? "spar"

const built = Bun.argv[3] ?? "dist"

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const path = new URL(request.url).pathname
    const file = Bun.file(`${root}${built}${path.endsWith("/") ? `${path}index.html` : path}`)

    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 })
  },
})

const browser = await chromium.launch()

const watchForTheApp = (): void => {
  const observer = new MutationObserver(() => {
    if (document.querySelector("#run") === null) return

    observer.disconnect()
    Reflect.set(globalThis, "appShownAt", performance.now())
  })

  observer.observe(document, { childList: true, subtree: true })
}

const profiled = async (): Promise<Run> => {
  const page = await browser.newPage()
  const session = await page.context().newCDPSession(page)

  await page.addInitScript(watchForTheApp)
  await session.send("Profiler.enable")
  await session.send("Profiler.setSamplingInterval", { interval: 50 })
  await session.send("Profiler.start")
  await page.goto(`http://127.0.0.1:${server.port}/${framework}/`)
  await page.waitForFunction(() => typeof Reflect.get(globalThis, "appShownAt") === "number")

  const shown = await page.evaluate(() => Number(Reflect.get(globalThis, "appShownAt")))
  const { profile } = await session.send("Profiler.stop")
  await page.close()

  return { shown, profile }
}

const runs = await Array.from({ length: 8 }).reduce<Promise<ReadonlyArray<Run>>>(
  async (collected) => [...(await collected), await profiled()],
  Promise.resolve([]),
)

const frameOf = (profile: Profile) => {
  const byId = new Map(profile.nodes.map((node) => [node.id, node.callFrame]))

  return (id: number) => byId.get(id)
}

const selfTimes = (profile: Profile): ReadonlyMap<string, number> => {
  const frame = frameOf(profile)

  return (profile.samples ?? []).reduce((totals, id, index) => {
    const found = frame(id)
    const key = `${found?.functionName || "(anonymous)"} ${found?.url.split("/").at(-1) ?? ""}:${found?.lineNumber ?? 0}`

    return new Map([
      ...totals,
      [key, (totals.get(key) ?? 0) + (profile.timeDeltas?.[index] ?? 0) / 1000],
    ])
  }, new Map<string, number>())
}

const kindOf = (name: string): string => {
  if (name === "(idle)") return "idle"
  if (name === "(program)") return "program"

  return "script"
}

const timeline = (profile: Profile): ReadonlyArray<string> => {
  const frame = frameOf(profile)
  const times = (profile.timeDeltas ?? []).reduce<ReadonlyArray<number>>(
    (all, delta) => [...all, (all.at(-1) ?? 0) + delta / 1000],
    [],
  )

  return (profile.samples ?? [])
    .map((id) => kindOf(frame(id)?.functionName ?? ""))
    .reduce<ReadonlyArray<Span>>((spans, kind, index) => {
      const last = spans.at(-1)
      const at = times[index] ?? 0

      return last?.kind === kind
        ? [...spans.slice(0, -1), { ...last, to: at }]
        : [...spans, { kind, from: at, to: at }]
    }, [])
    .filter((span) => span.to - span.from >= 0.3)
    .map((span) => `${span.from.toFixed(1)}-${span.to.toFixed(1)} ms ${span.kind}`)
}

const merged = runs
  .map((run) => selfTimes(run.profile))
  .reduce(
    (all, one) =>
      new Map([...all, ...[...one].map(([key, ms]) => [key, (all.get(key) ?? 0) + ms] as const)]),
    new Map<string, number>(),
  )

const median = runs.map((run) => run.shown).toSorted((left, right) => left - right)[4] ?? 0

console.log(`app shown at, median of ${runs.length}: ${median.toFixed(1)} ms`)
console.log(
  [...merged]
    .toSorted((left, right) => right[1] - left[1])
    .slice(0, 25)
    .map(([key, ms]) => `${(ms / runs.length).toFixed(2).padStart(6)} ms  ${key}`)
    .join("\n"),
)
console.log("timeline of the last run, from when profiling started:")
console.log(timeline(runs.at(-1)?.profile ?? { nodes: [] }).join("\n"))

await browser.close()
await server.stop()
