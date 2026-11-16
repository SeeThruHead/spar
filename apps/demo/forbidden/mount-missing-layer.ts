import { Layer } from "effect"
import { App } from "spar"
import { Counter } from "../src/counter/Counter.ts"

export const program = App.mount(Counter, { target: document.body, layer: Layer.empty })
