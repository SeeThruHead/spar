export type Found = { readonly label: string; readonly authorId: string | null }

export type Call = { readonly kind: string; readonly startedAt: number; readonly endedAt: number }

export const latency = 50

export const target = { org: "acme", team: "core", member: "ada", report: "q3" } as const

const isCalls = (known: unknown): known is ReadonlyArray<Call> => Array.isArray(known)

const calls = (): ReadonlyArray<Call> => {
  const known: unknown = Reflect.get(globalThis, "navCalls")

  return isCalls(known) ? known : []
}

const answered = (kind: string, id: string, startedAt: number): Found => {
  Reflect.set(globalThis, "navCalls", [...calls(), { kind, startedAt, endedAt: performance.now() }])

  return { label: `${kind} ${id}`, authorId: kind === "report" ? `author-of-${id}` : null }
}

export const lookup = (kind: string, id: string): Promise<Found> => {
  const startedAt = performance.now()

  return new Promise((resolve) => {
    setTimeout(() => resolve(answered(kind, id, startedAt)), latency)
  })
}
