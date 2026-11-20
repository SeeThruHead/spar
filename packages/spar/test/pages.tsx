import { Schema } from "effect"
import { Props, Reactive, View } from "spar"

export const Fruit = Schema.Struct({ id: Schema.String, name: Schema.String })

export type Fruit = typeof Fruit.Type

export const FruitView = View.make("FruitView", { fruit: Props.Reactive(Fruit) }, ({ fruit }) => (
  <li>{Reactive.map(fruit, (now) => now.name)}</li>
))

export const PairView = View.make("PairView", { fruit: Props.Reactive(Fruit) }, ({ fruit }) => (
  <>
    <dt>{Reactive.map(fruit, (now) => now.id)}</dt>
    <dd>{Reactive.map(fruit, (now) => now.name)}</dd>
  </>
))

export const PageView = View.make(
  "PageView",
  {
    title: Schema.String,
    count: Props.Reactive(Schema.Finite),
    busy: Props.Reactive(Schema.Boolean),
    tone: Props.Reactive(Schema.NullOr(Schema.String)),
    note: Props.State(Schema.String),
    online: Props.Reactive(Schema.Boolean),
    field: Props.Handle,
    fruits: Props.Element,
    pairs: Props.Element,
    dialog: Props.Element,
    report: Props.Element,
    onAdd: Props.Action,
  },
  (props) => (
    <main class="page" data-kind="shop" hidden={false}>
      <h1>
        {props.title} & <em>more</em>
      </h1>
      <p
        class={{ "is-busy loud": props.busy, quiet: false }}
        style={{ color: props.tone, "--gap": 4, backgroundColor: null }}
      >
        Count: {props.count}
        {props.note}
        {" items"}
      </p>
      <input
        ref={props.field}
        type="text"
        value={props.note}
        tabIndex={0}
        disabled={props.busy}
        aria-busy={props.busy}
      />
      <br />
      <i aria-hidden={true} />
      <button type="button" onClick={props.onAdd}>
        Add {"<one>"}
      </button>
      <output aria-label="Connection">
        {Reactive.map(props.online, (now) => (now ? "online" : "offline"))}
      </output>
      <ul>{props.fruits}</ul>
      <dl>{props.pairs}</dl>
      {props.dialog}
      {props.report}
    </main>
  ),
)

export const ReportView = View.make("ReportView", { lines: Schema.Finite }, ({ lines }) => (
  <aside>{lines} lines</aside>
))

export const LoadingView = View.make("LoadingView", {}, () => <p>Loading the report</p>)

export const DialogView = View.make("DialogView", {}, () => (
  <div role="dialog">Never on a server</div>
))
