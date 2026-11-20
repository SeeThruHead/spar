import { Layer } from "effect"
import { App, compose, withHandlers, withStore } from "spar"
import { CounterStore } from "../src/counter/CounterStore.ts"

const CountLabel = compose(withStore(CounterStore, (store) => ({ count: store.select.count })))(
  (props) => <output>{props.count}</output>,
)

const Page = compose(withHandlers(() => ({ title: "Counter" })))((props) => (
  <main>
    <h1>{props.title}</h1>
    <CountLabel />
  </main>
))

export const program = App.mount(Page, { target: document.body, layer: Layer.empty })
