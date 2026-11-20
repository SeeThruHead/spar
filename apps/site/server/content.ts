import { Schema } from "effect"
import { Page } from "../src/api.ts"

export const Section = Schema.Struct({
  slug: Schema.String,
  title: Schema.String,
  heading: Schema.String,
  anchor: Schema.String,
  text: Schema.String,
})

export type Section = typeof Section.Type

export const Content = Schema.Struct({
  pages: Schema.Array(Page),
  sections: Schema.Array(Section),
})

export type Content = typeof Content.Type
