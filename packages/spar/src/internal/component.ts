import { Predicate } from "effect"
import type { Component, Declared, Mountable, View } from "../View.ts"

export const TypeId = "~spar/Component"

export const isComponent = <Props, E, R, ViewProps>(
  mountable: Mountable<Props, E, R, ViewProps>,
): mountable is Component<Props, E, R, ViewProps> => Predicate.hasProperty(mountable, TypeId)

export const isPlainView = <Props, E, R, ViewProps>(
  mountable: Mountable<Props, E, R, ViewProps>,
): mountable is View<Props> & View<ViewProps> & Declared => !isComponent(mountable)
