import { Reactive } from "spar"
import type { Action, Element, Handle } from "spar"

export type Fruit = { readonly id: string; readonly name: string }

export const FruitView = ({ fruit }: { readonly fruit: Reactive.Reactive<Fruit> }) => (
  <li>{Reactive.map(fruit, (now) => now.name)}</li>
)

export const PairView = ({ fruit }: { readonly fruit: Reactive.Reactive<Fruit> }) => (
  <>
    <dt>{Reactive.map(fruit, (now) => now.id)}</dt>
    <dd>{Reactive.map(fruit, (now) => now.name)}</dd>
  </>
)

type PageProps = {
  readonly title: string
  readonly count: Reactive.Reactive<number>
  readonly busy: Reactive.Reactive<boolean>
  readonly tone: Reactive.Reactive<string | null>
  readonly note: Reactive.Reactive<string>
  readonly online: Reactive.Reactive<boolean>
  readonly field: Handle.Handle
  readonly fruits: Element
  readonly pairs: Element
  readonly dialog: Element
  readonly report: Element
  readonly onAdd: Action
}

export const PageView = (props: PageProps) => (
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
)

export const ReportView = ({ lines }: { readonly lines: number }) => <aside>{lines} lines</aside>

export const LoadingView = () => <p>Loading the report</p>

export const DialogView = () => <div role="dialog">Never on a server</div>
