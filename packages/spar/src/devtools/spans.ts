import { Array, Context, Effect, Layer, Schema, Tracer } from "effect"
import * as Cell from "../internal/cell.ts"
import * as Diagnostics from "../Diagnostics.ts"

export const Recorded = Schema.Struct({
  name: Schema.String,
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  failed: Schema.Boolean,
  attributes: Schema.Record(Schema.String, Schema.String),
})

export type Recorded = typeof Recorded.Type

export const Lens = Schema.Literals(["all", "rendering", "data", "stores", "backend"])

export type Lens = typeof Lens.Type

export const lensOf = (span: Recorded, where: "page" | "backend"): Lens | "other" => {
  if (where === "backend") return "backend"
  if (span.attributes["spar.kind"] === "view") return "rendering"
  if (span.attributes["spar.kind"] === "action") return "rendering"
  if (span.attributes["spar.kind"] === "data") return "data"
  if (span.attributes["spar.store"] !== undefined) return "stores"

  return "other"
}

export const inLens = (lens: string, span: Recorded, where: "page" | "backend"): boolean =>
  lens === "all" || lensOf(span, where) === lens

const requestedSuffix = "/requested"

const isRequest = (span: Recorded): boolean => span.name.endsWith(requestedSuffix)

const queryOf = (span: Recorded): string => span.name.slice(0, -requestedSuffix.length)

export const sourceOf = (
  span: Recorded,
  ordered: ReadonlyArray<Recorded>,
): Recorded | undefined => {
  const from = span.attributes["spar.query.after"] ?? ""
  if (from === "" || !isRequest(span)) return undefined

  const asked = `${from.split(" . ")[0]?.split("made from ").at(-1)}${requestedSuffix}`

  return ordered.findLast((each) => each.name === asked && each.startedAt <= span.startedAt)
}

export type Chain = {
  readonly requests: ReadonlyArray<string>
  readonly waits: ReadonlyArray<number>
  readonly sameInput: ReadonlyArray<string>
}

const upTo = (span: Recorded, ordered: ReadonlyArray<Recorded>): ReadonlyArray<Recorded> => {
  const source = sourceOf(span, ordered)

  return source === undefined ? [span] : [...upTo(source, ordered), span]
}

const sameInputAsSource = (span: Recorded, ordered: ReadonlyArray<Recorded>): boolean => {
  const input = span.attributes["spar.query.input"]
  if (input === undefined) return false

  return sourceOf(span, ordered)?.attributes["spar.query.input"] === input
}

const worthSaying = (chain: Chain): boolean =>
  chain.requests.length >= 3 || chain.sameInput.length > 0

export const chainsOf = (spans: ReadonlyArray<Recorded>): ReadonlyArray<Chain> => {
  const ordered = spans
    .filter(isRequest)
    .toSorted((left, right) => left.startedAt - right.startedAt)
  const sources = new Set(ordered.flatMap((span) => sourceOf(span, ordered)?.spanId ?? []))

  return ordered
    .filter((span) => !sources.has(span.spanId))
    .map((leaf) => upTo(leaf, ordered))
    .map((links) => ({
      requests: links.map(queryOf),
      waits: Array.zip(links, links.slice(1)).map(
        ([earlier, later]) => later.startedAt - earlier.startedAt,
      ),
      sameInput: links.filter((link) => sameInputAsSource(link, ordered)).map(queryOf),
    }))
    .filter(worthSaying)
}

const avoidable = (names: ReadonlyArray<string>): string =>
  names.length === 0
    ? ""
    : ` ${names.join(" and ")} had the same input as the request before it, so it did not need that answer to start.`

const waited = (millis: number | undefined): string =>
  millis === undefined ? "" : ` ${millis.toFixed(0)} ms later`

export const chainText = (chain: Chain): string =>
  Diagnostics.text("SPAR_QUERY_CHAIN", {
    said: `${chain.requests.length} requests ran one after another: ${chain.requests
      .map((name, index) => (index === 0 ? name : `${name}${waited(chain.waits[index - 1])}`))
      .join(", then ")}.${avoidable(chain.sameInput)}`,
  })

const millis = (nanos: bigint): number => Number(nanos / 1000n) / 1000

const endOf = (status: Tracer.SpanStatus): Pick<Recorded, "endedAt" | "failed"> =>
  status._tag === "Ended"
    ? { endedAt: millis(status.endTime), failed: status.exit._tag === "Failure" }
    : { endedAt: null, failed: false }

export const recordedOf = (span: Tracer.Span): Recorded => ({
  name: span.name,
  traceId: span.traceId,
  spanId: span.spanId,
  parentSpanId: span.parent._tag === "Some" ? span.parent.value.spanId : null,
  startedAt: millis(span.status.startTime),
  ...endOf(span.status),
  attributes: Object.fromEntries(
    [...span.attributes].map(([name, value]) => [name, String(value)] as const),
  ),
})

export class SpanBuffer extends Context.Service<
  SpanBuffer,
  {
    readonly ofTrace: (traceId: string) => ReadonlyArray<Recorded>
    readonly recent: () => ReadonlyArray<Recorded>
  }
>()("spar/devtools/SpanBuffer") {}

const buffering = (inner: Tracer.Tracer, keep: number) => {
  const kept = Cell.make<ReadonlyArray<Tracer.Span>>([])
  const tracer = Tracer.make({
    span: (given) => {
      const span = inner.span(given)

      kept.write([...kept.read(), span].slice(-keep))

      return span
    },
  })

  return Context.make(SpanBuffer, {
    ofTrace: (traceId) =>
      kept
        .read()
        .filter((span) => span.traceId === traceId)
        .map(recordedOf),
    recent: () => kept.read().map(recordedOf),
  }).pipe(Context.add(Tracer.Tracer, tracer))
}

export const layer = (
  options: { readonly keep: number } = { keep: 2000 },
): Layer.Layer<SpanBuffer> =>
  Layer.effectContext(Effect.map(Effect.tracer, (inner) => buffering(inner, options.keep)))

const Listed = Schema.fromJsonString(Schema.Array(Recorded))

export const textOf = (spans: ReadonlyArray<Recorded>): string => Schema.encodeSync(Listed)(spans)

export const fromText = Schema.decodeUnknownOption(Listed)
