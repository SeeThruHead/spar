import { Predicate } from "effect"
import type { Schema } from "effect"
import * as Props from "./Props.ts"

const TypeId = "~spar/Markup"

export type Markup = { readonly [TypeId]: string }

export const trusted = (html: string): Markup => ({ [TypeId]: html })

const isMarkup = (value: unknown): value is Markup => Predicate.hasProperty(value, TypeId)

export const htmlOf = (value: unknown): string => (isMarkup(value) ? value[TypeId] : "")

export const Markup: Schema.declare<Markup> = Props.kind(isMarkup, Props.named("markup"))
