import { Context, Effect, Layer, Schema, Tracer } from "effect"
import * as Cell from "../internal/cell.ts"

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
