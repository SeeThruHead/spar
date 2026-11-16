import { Predicate } from "effect"
import type { Option, SubscriptionRef } from "effect"
import type { Host } from "./dom.ts"

export const HandleTypeId = "~spar/Handle"

export type Handle = {
  readonly [HandleTypeId]: SubscriptionRef.SubscriptionRef<Option.Option<Host>>
}

export const isHandle = (value: unknown): value is Handle =>
  Predicate.hasProperty(value, HandleTypeId)
