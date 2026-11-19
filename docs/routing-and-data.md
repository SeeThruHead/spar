# Routes, data and no waterfalls

The short version: declare the data a component needs in that component, pass values down as
props the way you always would, and Spar loads everything that can load at once. You do not write
loaders, fragments or lists of dependencies.

## Start here: a prop from a store, a query that uses it

A parent reads a value from a store and passes it to a child. The child declares a query that
uses the prop.

```ts
class OrdersQuery extends Query.Tag<OrdersQuery>()("shop/Orders", {
  input: Schema.Int,
  success: Schema.Array(Order),
  failure: ServerUnreachable,
  load: (userId) => Effect.flatMap(Effect.service(Server), (server) => server.orders(userId)),
  staleAfter: "30 seconds",
}) {}

const Orders = View.taking(
  { userId: Props.Reactive(Schema.Int) },
  Effect.fnUntraced(function* ({ userId }) {
    const orders = yield* OrdersQuery.ask(userId)

    return { status: orders.status, count: Reactive.map(orders.value, (all) => all?.length ?? 0) }
  }),
)(OrdersView)

const Parent = View.connect(
  Effect.fnUntraced(function* () {
    const people = yield* PeopleStore

    return { orders: yield* View.child(Orders, { userId: people.select.selectedId }) }
  }),
)(ParentView)
```

That is the whole of it. Provide `OrdersQuery.live` where the app is mounted and it works.

What Spar does with it:

1. `ask` returns at once with a handle: `status`, `value`, `error`, `loading`, each a reactive
   value, and `refetch`. Nothing in a component's Effect waits for data.
2. Because nothing waits, the parent's Effect goes straight on to mount its children, and theirs
   mount theirs. Every `ask` in the tree is reached in one pass, and every query with an input
   starts then, together.
3. The query runs in its store, which lives at the root. The component can unmount and the
   answer still arrives and is kept. Two components that ask for the same input share one
   request.
4. When the prop changes, the query for the new value starts. An input that was loaded recently
   enough (`staleAfter`) is shown from the cache with no request.

A query that needs another query's answer takes its input from that answer:

```ts
const report = yield * ReportQuery.ask(reportId)
const author =
  yield *
  AuthorQuery.ask(Reactive.map(report.value, (found) => Option.fromNullishOr(found?.authorId)))
```

While the input is none the author query is `waiting`. The moment the report answers, it starts.
That is the only waterfall Spar allows, it is the one the data really has, and it shows: as the
`waiting` status, and in the trace, where the author's request says "input from Report . value".

The one rule: pass a changing value down as the reactive value it is (`Props.Reactive`), which is
how Spar passes changing values anyway. If you read it out into a plain number first, the child's
query cannot follow it when it changes.

## Routes

A route is a path and a Schema. Fields named in the path are path params; every other field is a
search param. Links and navigation take the decoded params, so a wrong param is a type error.

```ts
export const reportRoute = Router.route(
  "/org/:org/team/:team/member/:member/reports/:report",
  Schema.Struct({
    org: Schema.String,
    team: Schema.String,
    member: Schema.String,
    report: Schema.String,
  }),
)

const link = router.link(reportRoute, { org: "acme", team: "core", member: "ada", report: "q3" })
```

Segments nest with open-ended routes and an outlet in each layout. `Router.live` keeps a layout
mounted while only its params change and gives it the params as a reactive value, which is what a
query wants as its input:

```ts
const orgRoute = Router.route("/org/:org/*", Org)

const OrgSegment = View.taking(
  { params: Props.Reactive(Org) },
  Effect.fnUntraced(function* ({ params }) {
    const org = yield* OrgQuery.ask(Reactive.map(params, (now) => now.org))

    return {
      label: Reactive.map(org.value, (found) => found?.label ?? ""),
      inner: yield* Router.outlet({
        routes: [Router.live(teamRoute, TeamSegment)],
        otherwise: Missing,
      }),
    }
  }),
)(SegmentView)
```

A page five segments deep written this way starts all five segments' requests together. The
showcase has one (`apps/sidebar/src/Deep.ts`), and its browser check reads the backend's own
spans and fails if the five do not start together or if the sixth does not wait for the one it
needs (`apps/sidebar/scripts/deep.ts`).

## Preload on intent

A link has `onIntent`. Put it on the anchor and pointing at the link, or focusing it, starts the
target page's queries before the click:

```tsx
<a href={link.href} onClick={link.onClick} onPointerenter={link.onIntent} onFocus={link.onIntent}>
```

Spar rehearses the target: it mounts the app at that address without drawing anything, which
reaches every `ask` on the way, and throws the result away. The queries are real and their answers
stay in their stores, so the click finds the data there. Leave `onIntent` off a link whose page
should not be preloaded. `router.preload(route, params)` does the same from code.

## What makes a waterfall, and how Spar stops it

One thing: a component whose Effect waits. Everything below it mounts late, so their queries
start late.

- The build refuses a wait written straight into a component's Effect: `yield*` of
  `Effect.sleep`, `Effect.promise`, `Effect.tryPromise`, `Effect.callback`, `Deferred.await`,
  `Fiber.join` inside `View.connect` or `View.taking` (rule `no-waiting-in-components`). A wait in
  a handler, in a store's reaction or anywhere outside a component is fine.
- The build cannot see a wait behind a call such as `yield* server.describe(name)`. For that,
  any component that takes a frame or more before its children can mount gets a `waited` entry in
  the log with its name and the milliseconds, and `spar.waited_ms` on its span.

Forbidden, in short: fetching in a component's Effect (ask a query), and passing server data down
through props (the component that needs it asks for it, or a store's action reads the query with
`TheQuery.read(input)`).

## Seeing it

One navigation is one trace: the click, the route change, each segment mounting, each query's
request, the calls they make, the backend's spans, and each answer landing. In the devtools trace
panel, lenses show one kind at a time:

| Lens      | What it keeps                                                                          |
| --------- | -------------------------------------------------------------------------------------- |
| Rendering | Components mounting                                                                    |
| Data      | Queries: each request, its call, its answer, and what a dependent one's input was from |
| Stores    | Store commands and refusals                                                            |
| Backend   | Spans the backend recorded                                                             |

An agent gets the same with `get_trace` and a `lens`.

## On the server

`Server.render` mounts the page, waits until every query has settled, dependent ones included, and
draws. The queries' stores travel with the page like any store's, so in the browser the first
`ask` finds its data fresh and makes no request. Give a query a `staleAfter` or the browser will
ask again straight away. There are no server components and no second kind of component: the
server boundary is the RPC contract both sides share.

## Not built yet

A route tree as one value, pending and error views declared per segment, code splitting per
route, scroll restoration per history entry; refetch on focus and reconnect, pagination,
optimistic updates on a query, retries; dependency edges drawn as lines in the waterfall.
