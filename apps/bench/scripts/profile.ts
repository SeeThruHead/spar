import { chromium } from "playwright"
import type { Browser, Page } from "playwright"
import { sourceOfLines } from "./sourceLines.ts"

type Step = { readonly click: string; readonly rows: number }

type Done = { readonly kind: "rows"; readonly count: number } | { readonly kind: "selected" }

type Probe = {
  readonly id: string
  readonly before: ReadonlyArray<Step>
  readonly click: string
  readonly done: Done
}

type TraceEvent = {
  readonly name: string
  readonly ph: string
  readonly pid: number
  readonly tid: number
  readonly ts: number
  readonly dur?: number
  readonly args?: { readonly name?: string; readonly data?: unknown }
}

type ProfileNode = {
  readonly id: number
  readonly children?: ReadonlyArray<number>
  readonly callFrame: {
    readonly functionName: string
    readonly url: string
    readonly lineNumber: number
  }
}

type Span = readonly [number, number]

const root = new URL("..", import.meta.url).pathname

const setting = (name: string): string | undefined => Bun.env[name]

const runs = Number(setting("PROFILE_RUNS") ?? 7)

const top = Number(setting("PROFILE_TOP") ?? 30)

const settle = Number(setting("PROFILE_SETTLE") ?? 100)

const lead = Number(setting("PROFILE_LEAD") ?? 0)

const timedBuild: "production" | "readable" =
  setting("PROFILE_TIMED") === "readable" ? "readable" : "production"

const frameworks = (setting("PROFILE_FRAMEWORKS") || "spar,effect-ui,solid").split(",")

const wanted = (setting("PROFILE_PROBES") || "select,clear,startup").split(",")

const probes: ReadonlyArray<Probe> = [
  {
    id: "select",
    before: [{ click: "#run", rows: 1000 }],
    click: "#tbody tr:nth-child(2) a.lbl",
    done: { kind: "selected" },
  },
  {
    id: "clear",
    before: [{ click: "#run", rows: 1000 }],
    click: "#clear",
    done: { kind: "rows", count: 0 },
  },
]

const categories = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "blink.user_timing",
  "v8",
  "disabled-by-default-v8.gc",
].join(",")

const kinds: ReadonlyArray<readonly [string, (name: string) => boolean]> = [
  ["gc", (name) => name.includes("GC")],
  ["style", (name) => name === "UpdateLayoutTree" || name === "RecalculateStyles"],
  ["layout", (name) => name === "Layout"],
  ["paint", (name) => ["Paint", "PrePaint", "Layerize", "Commit", "UpdateLayer"].includes(name)],
  [
    "script",
    (name) =>
      [
        "FunctionCall",
        "EvaluateScript",
        "EventDispatch",
        "TimerFire",
        "FireAnimationFrame",
        "RunMicrotasks",
        "v8.compile",
        "v8.compileModule",
        "V8.Execute",
      ].includes(name),
  ],
]

const sourceMaps: ReadonlyMap<string, ReadonlyArray<string>> = new Map(
  await Promise.all(
    [...new Bun.Glob("*/assets/*.js.map").scanSync(`${root}dist-readable`)].map(
      async (path) =>
        [
          path
            .split("/")
            .at(-1)
            ?.replace(/\.map$/, "") ?? path,
          sourceOfLines(await Bun.file(`${root}dist-readable/${path}`).text()),
        ] as const,
    ),
  ),
)

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch: async (request) => {
    const [, build, ...rest] = new URL(request.url).pathname.split("/")
    const path = `/${rest.join("/")}`
    const folder = build === "production" ? "dist" : "dist-readable"
    const file = Bun.file(`${root}${folder}${path.endsWith("/") ? `${path}index.html` : path}`)

    return (await file.exists()) ? new Response(file) : new Response("", { status: 404 })
  },
})

type Build = "production" | "readable"

const urlOf = (framework: string, build: Build): string =>
  `http://127.0.0.1:${server.port}/${build}/${framework}/`

const blankOf = (): string => `http://127.0.0.1:${server.port}/readable/blank`

const union = (spans: ReadonlyArray<Span>): number =>
  spans
    .toSorted((left, right) => left[0] - right[0])
    .reduce<{ readonly total: number; readonly reach: number }>(
      ({ total, reach }, [start, end]) => {
        if (end <= reach) return { total, reach }

        return { total: total + end - Math.max(start, reach), reach: end }
      },
      { total: 0, reach: -Infinity },
    ).total

const median = (values: ReadonlyArray<number>): number =>
  values.toSorted((left, right) => left - right).at(Math.floor(values.length / 2)) ?? 0

const markOf = (events: ReadonlyArray<TraceEvent>, name: string): TraceEvent | undefined =>
  events.find((event) => event.name === name && event.ph !== "M")

const namesMainThread = (event: TraceEvent, pid: number): boolean => {
  if (event.ph !== "M") return false
  if (event.pid !== pid) return false
  if (event.name !== "thread_name") return false

  return event.args?.name === "CrRendererMain"
}

const mainThreadOf = (events: ReadonlyArray<TraceEvent>, pid: number): number =>
  events.find((event) => namesMainThread(event, pid))?.tid ?? -1

const spansIn = (
  events: ReadonlyArray<TraceEvent>,
  from: number,
  to: number,
): ReadonlyArray<readonly [string, Span]> =>
  events.flatMap((event) => {
    if (event.ph !== "X") return []

    const start = Math.max(event.ts, from)
    const end = Math.min(event.ts + (event.dur ?? 0), to)
    if (end <= start) return []

    return [[event.name, [start, end]] as const]
  })

const showEvents = setting("PROFILE_EVENTS") === "1"

const shownNames = new Set([
  "RunTask",
  "TimerInstall",
  "TimerFire",
  "FunctionCall",
  "RunMicrotasks",
  "EventDispatch",
  "FireAnimationFrame",
  "RequestAnimationFrame",
  "ScheduleStyleRecalculation",
  "UpdateLayoutTree",
  "Layout",
  "Paint",
  "Commit",
])

const showNames = setting("PROFILE_NAMES") === "1"

const namesText = (spans: ReadonlyArray<readonly [string, Span]>): string =>
  [
    "-- time by event name (overlaps merged within a name)",
    ...[...new Set(spans.map(([name]) => name))]
      .map(
        (name) =>
          [
            name,
            union(spans.filter(([each]) => each === name).map(([, span]) => span)) / 1000,
          ] as const,
      )
      .toSorted((left, right) => right[1] - left[1])
      .slice(0, 25)
      .map(([name, time]) => `${time.toFixed(2).padStart(8)} ms  ${name}`),
  ].join("\n")

const eventsText = (
  onMain: ReadonlyArray<TraceEvent>,
  zero: number,
  from: number,
  to: number,
): string =>
  [
    "-- events",
    ...onMain
      .filter((event) => shownNames.has(event.name) && event.ts >= from && event.ts <= to)
      .toSorted((left, right) => left.ts - right.ts)
      .map(
        (event) =>
          `${((event.ts - zero) / 1000).toFixed(2).padStart(7)} +${((event.dur ?? 0) / 1000).toFixed(2)} ${event.name} ${JSON.stringify(event.args?.data ?? {}).slice(0, 140)}`,
      ),
  ].join("\n")

const breakdown = (traced: Buffer, startAtFirst: boolean): Readonly<Record<string, number>> => {
  const events: ReadonlyArray<TraceEvent> = JSON.parse(traced.toString()).traceEvents
  const end = markOf(events, "probe-end")
  if (end === undefined) return {}

  const tid = mainThreadOf(events, end.pid)
  const onMain = events.filter((event) => event.pid === end.pid && event.tid === tid)
  const begin = startAtFirst
    ? Math.min(...onMain.filter((event) => event.ph === "X").map((event) => event.ts))
    : (markOf(events, "probe-start")?.ts ?? end.ts)
  const spans = spansIn(onMain, begin, end.ts)

  if (showEvents) console.error(eventsText(onMain, begin, begin - lead * 1000, end.ts))
  if (showNames) console.error(namesText(spans))

  return Object.fromEntries([
    ["window", (end.ts - begin) / 1000],
    ["busy", union(spans.map(([, span]) => span)) / 1000],
    ...kinds.map(
      ([kind, matches]) =>
        [
          kind,
          union(spans.filter(([name]) => matches(name)).map(([, span]) => span)) / 1000,
        ] as const,
    ),
  ])
}

type Profile = {
  readonly nodes: ReadonlyArray<ProfileNode>
  readonly samples?: ReadonlyArray<number>
  readonly timeDeltas?: ReadonlyArray<number>
}

const fileOf = (node: ProfileNode): string => node.callFrame.url.split("/").at(-1) ?? ""

const sourceOf = (node: ProfileNode): string => {
  const file = fileOf(node)
  const lines = sourceMaps.get(file)
  if (lines === undefined) return file === "" ? node.callFrame.functionName : file

  return lines[node.callFrame.lineNumber] ?? file
}

const labelOf = (node: ProfileNode): string =>
  `${node.callFrame.functionName || "(anonymous)"} ${fileOf(node)}:${node.callFrame.lineNumber + 1} [${sourceOf(node)}]`

const stackOf = (
  id: number,
  parents: ReadonlyMap<number, number>,
  labels: ReadonlyMap<number, string>,
): ReadonlyArray<string> => {
  const parent = parents.get(id)
  const label = labels.get(id) ?? "?"

  return parent === undefined ? [label] : [label, ...stackOf(parent, parents, labels)]
}

const timesOf = (
  profile: Profile,
  inclusive: boolean,
  label: (node: ProfileNode) => string = labelOf,
): ReadonlyMap<string, number> => {
  const labels = new Map(profile.nodes.map((node) => [node.id, label(node)]))
  const parents = new Map(
    profile.nodes.flatMap((node) =>
      (node.children ?? []).map((child) => [child, node.id] as const),
    ),
  )
  const deltas = profile.timeDeltas ?? []

  return (profile.samples ?? []).reduce((all, id, index) => {
    const counted = inclusive ? [...new Set(stackOf(id, parents, labels))] : [labels.get(id) ?? "?"]

    return counted.reduce(
      (sum, name) => sum.set(name, (sum.get(name) ?? 0) + (deltas[index] ?? 0) / 1000),
      all,
    )
  }, new Map<string, number>())
}

const selfTimes = (profile: Profile): ReadonlyMap<string, number> => timesOf(profile, false)

const allTimes = (profile: Profile): ReadonlyMap<string, number> => timesOf(profile, true)

const bySource = (profile: Profile): ReadonlyMap<string, number> =>
  timesOf(profile, false, sourceOf)

const bySourceWithCalls = (profile: Profile): ReadonlyMap<string, number> =>
  timesOf(profile, true, sourceOf)

const merged = (maps: ReadonlyArray<ReadonlyMap<string, number>>): ReadonlyMap<string, number> =>
  maps.reduce<Map<string, number>>(
    (all, each) =>
      [...each].reduce((sum, [label, time]) => sum.set(label, (sum.get(label) ?? 0) + time), all),
    new Map<string, number>(),
  )

const prepare = async (
  page: Page,
  framework: string,
  probe: Probe,
  build: Build,
): Promise<void> => {
  await page.goto(urlOf(framework, build))
  await page.waitForSelector("#run")
  await probe.before.reduce(
    (done, step) =>
      done.then(async () => {
        await page.click(step.click)
        await page.waitForFunction(
          (rows) => document.querySelector("#tbody")?.childElementCount === rows,
          step.rows,
        )
      }),
    Promise.resolve(),
  )
  await page.waitForTimeout(settle)
}

const act = (page: Page, probe: Probe): Promise<void> =>
  page.evaluate(
    ({ click, done }) =>
      new Promise<void>((resolve) => {
        const tbody = document.querySelector("#tbody")
        const reached = (): boolean => {
          if (done.kind === "rows") return tbody?.childElementCount === done.count

          return tbody?.querySelector("tr:nth-child(2)")?.className === "danger"
        }
        const observer = new MutationObserver(() => {
          if (!reached()) return

          observer.disconnect()
          requestAnimationFrame(() =>
            setTimeout(() => {
              performance.mark("probe-end")
              resolve()
            }, 0),
          )
        })

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        })
        performance.mark("probe-start")
        document.querySelector<HTMLElement>(click)?.click()
      }),
    { click: probe.click, done: probe.done },
  )

const traced = async (browser: Browser, framework: string, probe: Probe) => {
  const page = await browser.newPage()

  if (lead > 0) await browser.startTracing(page, { categories: [categories] })
  await prepare(page, framework, probe, timedBuild)
  if (lead === 0) await browser.startTracing(page, { categories: [categories] })
  await act(page, probe)

  const trace = await browser.stopTracing()

  await page.close()

  return breakdown(trace, false)
}

const sampled = async (browser: Browser, framework: string, probe: Probe) => {
  const page = await browser.newPage()

  await prepare(page, framework, probe, "readable")

  const session = await page.context().newCDPSession(page)

  await session.send("Profiler.enable")
  await session.send("Profiler.setSamplingInterval", { interval: 50 })
  await session.send("Profiler.start")
  await act(page, probe)

  const { profile } = await session.send("Profiler.stop")

  await page.close()

  return profile
}

const showWhenLoaded = (): void => {
  const observer = new MutationObserver(() => {
    if (document.querySelector("#run") === null) return

    observer.disconnect()
    performance.mark("probe-end")
    Reflect.set(globalThis, "probeShown", true)
  })

  observer.observe(document, { childList: true, subtree: true })
}

const loaded = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => Reflect.get(globalThis, "probeShown") === true)

const tracedStartup = async (browser: Browser, framework: string) => {
  const page = await browser.newPage()

  await page.addInitScript(showWhenLoaded)
  await page.goto(blankOf())
  await browser.startTracing(page, { categories: [categories] })
  await page.goto(urlOf(framework, timedBuild))
  await loaded(page)

  const trace = await browser.stopTracing()

  await page.close()

  return breakdown(trace, true)
}

const sampledStartup = async (browser: Browser, framework: string) => {
  const page = await browser.newPage()

  await page.addInitScript(showWhenLoaded)
  await page.goto(blankOf())

  const session = await page.context().newCDPSession(page)

  await session.send("Profiler.enable")
  await session.send("Profiler.setSamplingInterval", { interval: 50 })
  await session.send("Profiler.start")
  await page.goto(urlOf(framework, "readable"))
  await loaded(page)

  const { profile } = await session.send("Profiler.stop")

  await page.close()

  return profile
}

const repeated = <A>(make: () => Promise<A>): Promise<ReadonlyArray<A>> =>
  Array.from({ length: runs }).reduce<Promise<ReadonlyArray<A>>>(
    (collected) => collected.then(async (all) => [...all, await make()]),
    Promise.resolve([]),
  )

const ignored = ["(idle)", "(root)", "(program)"]

const report = (
  framework: string,
  id: string,
  timelines: ReadonlyArray<Readonly<Record<string, number>>>,
  profiles: ReadonlyArray<Profile>,
): string => {
  const keys = ["window", "busy", ...kinds.map(([kind]) => kind)]
  const line = keys
    .map((key) => `${key} ${median(timelines.map((each) => each[key] ?? 0)).toFixed(2)}`)
    .join("  ")
  const listed = (totals: ReadonlyMap<string, number>): ReadonlyArray<string> =>
    [...totals]
      .filter(([label]) => !ignored.some((name) => label.startsWith(name)))
      .toSorted((left, right) => right[1] - left[1])
      .slice(0, top)
      .map(([label, time]) => `    ${(time / runs).toFixed(3).padStart(8)} ms  ${label}`)

  return [
    `== ${framework} ${id} (median of ${runs}, ms; timeline from the ${timedBuild} build, samples from the readable build)`,
    `  ${line}`,
    "  self time, mean per run:",
    ...listed(merged(profiles.map(selfTimes))),
    "  total time, with what it called, mean per run:",
    ...listed(merged(profiles.map(allTimes))),
    "  self time by source file, mean per run:",
    ...listed(merged(profiles.map(bySource))),
    "  total time by source file, with what it called, mean per run:",
    ...listed(merged(profiles.map(bySourceWithCalls))),
  ].join("\n")
}

const forProbe = async (browser: Browser, framework: string, probe: Probe) =>
  report(
    framework,
    probe.id,
    await repeated(() => traced(browser, framework, probe)),
    await repeated(() => sampled(browser, framework, probe)),
  )

const forStartup = async (browser: Browser, framework: string) =>
  report(
    framework,
    "startup",
    await repeated(() => tracedStartup(browser, framework)),
    await repeated(() => sampledStartup(browser, framework)),
  )

const browser = await chromium.launch()

const sections = await frameworks.reduce<Promise<ReadonlyArray<string>>>(
  (collected, framework) =>
    collected.then(async (done) => {
      const measured = await probes
        .filter((probe) => wanted.includes(probe.id))
        .reduce<Promise<ReadonlyArray<string>>>(
          (inner, probe) =>
            inner.then(async (all) => [...all, await forProbe(browser, framework, probe)]),
          Promise.resolve([]),
        )
      const started = wanted.includes("startup") ? [await forStartup(browser, framework)] : []

      return [...done, ...measured, ...started]
    }),
  Promise.resolve([]),
)

await browser.close()
await server.stop(true)

console.log(sections.join("\n\n"))
