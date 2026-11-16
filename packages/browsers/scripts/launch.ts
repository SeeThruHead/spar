import { chromium, firefox, webkit } from "playwright"
import type { Browser } from "playwright"

const engines = { chromium, firefox, webkit }

export type Engine = keyof typeof engines

const isEngine = (name: string): name is Engine => Object.hasOwn(engines, name)

export const engine = (): Engine => {
  const asked = Bun.env["SPAR_BROWSER"] ?? "chromium"
  if (!isEngine(asked))
    throw new Error(`SPAR_BROWSER is "${asked}"; use chromium, firefox or webkit`)

  return asked
}

export const launch = (): Promise<Browser> => {
  const server = Bun.env["SPAR_BROWSER_SERVER"]
  if (server === undefined) return engines[engine()].launch()

  return engines[engine()].connect(server)
}
