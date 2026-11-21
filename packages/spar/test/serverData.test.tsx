import { describe, it } from "@effect/vitest"
import { Context, Effect, Layer, Option, Schema } from "effect"
import {
  For,
  Props,
  Query,
  Reactive,
  State,
  Store,
  compose,
  withProps,
  withQuery,
  withStore,
} from "spar"
import * as Testing from "spar/testing"

const Order = Schema.Struct({ id: Schema.Int })

const Post = Schema.Struct({ id: Schema.String, title: Schema.String })

const Page = Schema.Struct({ posts: Schema.Array(Post), nextCursor: Schema.NullOr(Schema.String) })

class ServerUnreachable extends Schema.TaggedError<
  ServerUnreachable,
  { readonly brand: unique symbol }
>()("ServerUnreachable", {}) {}

class Server extends Context.Service<
  Server,
  {
    readonly orders: (
      userId: number,
    ) => Effect.Effect<ReadonlyArray<typeof Order.Type>, ServerUnreachable>
    readonly posts: (after: string | null) => Effect.Effect<typeof Page.Type>
  }
>()("test/docs/Server") {}

const pages: Readonly<Record<string, typeof Page.Type>> = {
  start: { posts: [{ id: "p1", title: "First post" }], nextCursor: "c1" },
  c1: { posts: [{ id: "p2", title: "Second post" }], nextCursor: null },
}

const server = Layer.succeed(Server, {
  orders: (userId) => Effect.succeed(Array.from({ length: userId }, (_, id) => ({ id }))),
  posts: (after) => Effect.succeed(pages[after ?? "start"] ?? { posts: [], nextCursor: null }),
})

const People = Schema.Struct({ selectedId: Schema.Int })

class PeopleStore extends Store.Tag<PeopleStore>()("test/docs/People", {
  state: People,
  initialState: { selectedId: 3 },
  actions: {},
  selectors: {
    selectedId: Store.selector(Schema.Int, (state: typeof People.Type) => state.selectedId),
  },
}) {}

export class OrdersQuery extends Query.Tag<OrdersQuery>()("shop/Orders", {
  input: Schema.Int,
  success: Schema.Array(Order),
  failure: ServerUnreachable,
  load: (userId: number) => Effect.flatMap(Effect.service(Server), (found) => found.orders(userId)),
  staleAfter: "30 seconds",
}) {}

export const Orders = compose(
  withProps({ userId: Props.Reactive(Schema.Int) }),
  withQuery("orders", OrdersQuery, (props) => props.userId),
)((props) => (
  <p>
    {props.orders.status}: {Reactive.map(props.orders.value, (all) => all?.length ?? 0)} orders
  </p>
))

export const Parent = compose(
  withStore(PeopleStore, (people) => ({ selected: people.select.selectedId })),
)((props) => <Orders userId={props.selected} />)

export class PostsQuery extends Query.Tag<PostsQuery>()("blog/Posts", {
  input: Schema.Struct({ after: Schema.NullOr(Schema.String) }),
  success: Page,
  failure: Schema.Never,
  load: ({ after }: { readonly after: string | null }) =>
    Effect.flatMap(Effect.service(Server), (found) => found.posts(after)),
}) {}

const withFeed = Effect.fnUntraced(function* () {
  const feed = yield* PostsQuery.pages({
    first: { after: null },
    next: (page) => Option.map(Option.fromNullishOr(page.nextCursor), (after) => ({ after })),
  })

  return {
    posts: Reactive.map(feed.pages, (all) => all.flatMap((page) => page.posts)),
    loading: feed.loading,
    more: feed.more,
    onMore: feed.loadMore,
  }
})

export const Feed = compose(withFeed)((props) => (
  <section aria-label="Posts">
    <ul>
      <For each={props.posts} by={(post) => post.id}>
        {(post) => <li>{Reactive.map(post, (now) => now.title)}</li>}
      </For>
    </ul>
    <button type="button" hidden={Reactive.map(props.more, (more) => !more)} onClick={props.onMore}>
      More
    </button>
  </section>
))

const layer = Layer.mergeAll(OrdersQuery.live, PostsQuery.live, PeopleStore.layer).pipe(
  Layer.provideMerge(server),
  Layer.provideMerge(State.layer),
)

describe("State and server data, as the docs show it", () => {
  it.live("a store's value passed down as a prop is the input of the child's query", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Parent)
      yield* Testing.findText("loaded: 3 orders")
    }).pipe(Effect.provide(layer), Effect.scoped),
  )

  it.live("a list read a page at a time loads the next page and then says there is no more", () =>
    Effect.gen(function* () {
      yield* Testing.mount(Feed)
      yield* Testing.findText("First post")
      yield* Testing.click("button", "More")
      yield* Testing.findText("Second post")
      yield* Testing.gone("button", "More")
    }).pipe(Effect.provide(layer), Effect.scoped),
  )
})
