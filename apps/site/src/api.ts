import { Schema } from "effect"

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
