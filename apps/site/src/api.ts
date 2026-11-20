import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

export const Heading = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  level: Schema.Int,
})

export type Heading = typeof Heading.Type

export const Page = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  html: Schema.String,
  headings: Schema.Array(Heading),
})

export type Page = typeof Page.Type

export const Hit = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  heading: Schema.String,
  anchor: Schema.String,
  excerpt: Schema.String,
})

export type Hit = typeof Hit.Type

export class NotKnown extends Schema.TaggedError<NotKnown, { readonly brand: unique symbol }>()(
  "NotKnown",
  { what: Schema.String },
) {}

export class Library extends RpcGroup.make(
  Rpc.make("Page", { payload: { slug: Schema.String }, success: Page, error: NotKnown }),
  Rpc.make("Search", { payload: { text: Schema.String }, success: Schema.Array(Hit) }),
) {}
