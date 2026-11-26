import { Context, Duration, Effect, FiberHandle, Ref, Schema } from "effect"
import {
  For,
  Props,
  Query,
  Reactive,
  Show,
  Store,
  UiState,
  compose,
  withEffect,
  withHandlers,
  withKey,
  withProps,
  withQuery,
  withStore,
  withUiState,
} from "spar"
import { valueOf } from "./results.ts"

const Counting = Schema.Struct({
  count: Schema.Int,
  phase: Schema.Literals(["idle", "resetting"]),
})

type Counting = typeof Counting.Type

const fresh: Counting = { count: 0, phase: "idle" }

export class CounterStore extends Store.Tag<CounterStore>()("composed/Counter", {
  state: Counting,
  initialState: fresh,
  actions: {
    incremented: Store.action(Schema.Void, (state: Counting): Counting => ({
      ...state,
      count: state.count + 1,
    })),
    resetClicked: Store.action(Schema.Void, (state: Counting): Counting => ({
      ...state,
      phase: "resetting",
    })),
    resetCompleted: Store.action(Schema.Void, (_state: Counting): Counting => fresh),
  },
  selectors: {
    count: Store.selector(Schema.Int, (state: Counting) => state.count),
    phase: Store.selector(Schema.String, (state: Counting) => state.phase),
  },
}) {}

const withReset = Effect.fnUntraced(function* () {
  const store = yield* CounterStore
  const running = yield* FiberHandle.make()
  const reset = Effect.gen(function* () {
    yield* store.commands.resetClicked()
    yield* Effect.sleep(Duration.millis(50))
    yield* store.commands.resetCompleted()
  })

  return { onReset: Effect.asVoid(FiberHandle.run(running, reset, { onlyIfMissing: true })) }
})

export const ResetCounter = compose(
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    phase: store.select.phase,
    onIncrement: store.commands.incremented(),
  })),
  withReset,
  withKey("+", (props) => props.onIncrement),
)((props) => (
  <section aria-label="Counter">
    <output aria-label="Count">{props.count}</output>
    <output aria-label="Phase">{props.phase}</output>
    <button onClick={props.onIncrement}>Add 1</button>
    <button onClick={props.onReset}>Reset after a delay</button>
  </section>
))

export const Dropdown = compose(
  withProps({
    label: Schema.String,
    items: Schema.Array(Schema.String),
    onPick: Props.Callback(Schema.String),
  }),
  withUiState("open", Schema.Boolean, false),
  withKey("Escape", (props) => UiState.set(props.open, false)),
)((props) => (
  <div class="dropdown">
    <button aria-expanded={props.open} onClick={UiState.update(props.open, (open) => !open)}>
      {props.label}
    </button>
    <Show when={props.open}>
      <ul role="menu" aria-label={props.label}>
        <For each={props.items} by={(item) => item}>
          {(item, key) => (
            <li role="menuitem" onClick={[props.onPick(key), UiState.set(props.open, false)]}>
              {item}
            </li>
          )}
        </For>
      </ul>
    </Show>
  </div>
))

export const Toolbar = compose(
  withUiState("sort", Schema.String, "Newest"),
  withUiState("show", Schema.String, "Everything"),
)((props) => (
  <header>
    <Dropdown
      label="Sort by"
      items={["Newest", "Oldest", "Largest"]}
      onPick={(item) => UiState.set(props.sort, item)}
    />
    <Dropdown
      label="Show"
      items={["Everything", "Mine"]}
      onPick={(item) => UiState.set(props.show, item)}
    />
    <output aria-label="Sort">{props.sort}</output>
    <output aria-label="Shown">{props.show}</output>
  </header>
))

export class Shop extends Context.Service<
  Shop,
  { readonly ordersOf: (userId: string) => Effect.Effect<ReadonlyArray<string>> }
>()("composed/Shop") {}

export class OrdersQuery extends Query.Tag<OrdersQuery>()("composed/Orders", {
  input: Schema.String,
  success: Schema.Array(Schema.String),
  failure: Schema.Never,
  load: (userId: string) => Effect.flatMap(Effect.service(Shop), (shop) => shop.ordersOf(userId)),
}) {}

type Session = { readonly userId: string }

export class SessionStore extends Store.Tag<SessionStore>()("composed/Session", {
  state: Schema.Struct({ userId: Schema.String }),
  initialState: { userId: "ada" },
  actions: {
    signedIn: Store.action(Schema.String, (_state: Session, userId: string): Session => ({
      userId,
    })),
  },
  selectors: { userId: Store.selector(Schema.String, (state: Session) => state.userId) },
}) {}

export const Orders = compose(
  withProps({ userId: Props.Reactive(Schema.String) }),
  withQuery("orders", OrdersQuery, (props) => props.userId),
)((props) => (
  <p aria-label="Orders">
    {Reactive.map(valueOf(props.orders), (found) => `${found?.length ?? 0} orders`)}
  </p>
))

export const Account = compose(
  withStore(SessionStore, (session) => ({
    userId: session.select.userId,
    onSwitch: session.commands.signedIn("grace"),
  })),
)((props) => (
  <section>
    <h2 aria-label="User">{props.userId}</h2>
    <button onClick={props.onSwitch}>Switch user</button>
    <Orders userId={props.userId} />
  </section>
))

export const withHover = compose(
  withUiState("hovered", Schema.Boolean, false),
  withHandlers((props) => ({
    onEnter: UiState.set(props.hovered, true),
    onLeave: UiState.set(props.hovered, false),
  })),
)

const withInitials = (props: { readonly name: string }) =>
  Effect.succeed({ initials: props.name.slice(0, 1).toUpperCase() })

export const Card = compose(
  withProps({ title: Schema.String }),
  withHover,
)((props) => (
  <article
    aria-label={props.title}
    class={{ card: true, raised: props.hovered }}
    onPointerenter={props.onEnter}
    onPointerleave={props.onLeave}
  >
    {props.title}
  </article>
))

export const Avatar = compose(
  withProps({ name: Schema.String }),
  withInitials,
  withHover,
)((props) => (
  <figure aria-label={props.name} onPointerenter={props.onEnter} onPointerleave={props.onLeave}>
    <span>{props.initials}</span>
    <figcaption hidden={Reactive.map(props.hovered, (hovered) => !hovered)}>
      {props.name}
    </figcaption>
  </figure>
))

export const Ticker = compose(
  withUiState("ticks", Schema.Int, 0),
  withEffect(
    Effect.fn("ticking")(function* (props: { readonly ticks: UiState.UiState<number> }) {
      yield* Effect.sleep("10 millis")
      yield* UiState.set(props.ticks, 1)
    }),
  ),
)((props) => <output aria-label="Ticks">{props.ticks}</output>)

export const Tags = compose(withUiState("tags", Schema.Array(Schema.String), ["one", "two"]))(
  (props) => (
    <ul aria-label="Tags">
      <For each={props.tags} by={(tag) => tag}>
        {(tag) => <li>{tag}</li>}
      </For>
    </ul>
  ),
)

export const Picker = compose(
  withUiState("order", Schema.Array(Schema.String), ["fruit", "tea"]),
  withHandlers((props) => ({
    onFlip: UiState.update(props.order, (order) => order.toReversed()),
  })),
)((props) => (
  <section>
    <button onClick={props.onFlip}>Flip</button>
    <For each={props.order} by={(name) => name}>
      {(_name, key) => <Dropdown label={key} items={["a", "b"]} onPick={() => Effect.void} />}
    </For>
  </section>
))

export const Gallery = compose(withHandlers(() => ({})))(() => (
  <main>
    <Card title="Release notes" />
    <Avatar name="ada" />
    <Tags />
  </main>
))

export class Calls extends Context.Service<Calls, Ref.Ref<number>>()("composed/Calls") {}

const withCounted = () =>
  Effect.flatMap(Effect.service(Calls), (calls) =>
    Effect.as(
      Ref.update(calls, (n) => n + 1),
      {},
    ),
  )

export const Counted = compose(
  withCounted,
  withStore(CounterStore, (store) => ({
    count: store.select.count,
    onIncrement: store.commands.incremented(),
  })),
  withHover,
)((props) => (
  <p>
    <output aria-label="Counted">{props.count}</output>
    <button onClick={props.onIncrement}>More</button>
  </p>
))

export const [Unnamed] = [compose(withHandlers(() => ({})))(() => <p>unnamed</p>)]
