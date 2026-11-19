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

A route inside another is declared under it, so its path is written once. The parent must end
with `/*`, and the Schema must carry every param of the whole path; both are compile errors
otherwise:

```ts
const teamRoute = Router.under(orgRoute, "/team/:team/*", Team)
const memberRoute = Router.under(teamRoute, "/member/:member/*", Member)
```

There is no separate route tree to keep in step: the nesting is the outlets, and the paths follow
from `under`.

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

## Loading a page's code when it is first shown

```ts
Router.live(
  orgRoute,
  View.split(LoadingView, () => import("./DeepPage.ts").then((module) => module.OrgSegment)),
)
```

`View.split` shows the placeholder, a view that takes the same props, until the code has
arrived. Routes, param Schemas and query classes stay in the main bundle because the query layers
are provided at the root; the components and their views are what is split off. Preloading a link
fetches the code too, since the rehearsal mounts the page. On the server and while taking over a
server-drawn page the real component is used, not the placeholder. The showcase's deep page is
loaded this way (`apps/sidebar/src/Shell.ts`).

## Pending and failure, per segment

Each segment shows its own query's `status`, so one slow segment does not blank the others. For
a component whose own Effect can wait or fail, `View.pending(placeholder)` and
`View.recover(failure, view)` wrap that component alone. A query takes `retry`, a schedule,
and stays `loading` until the schedule gives up.

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
| Rendering | Components mounting, and each event a component handled (`on click`, with its view)    |
| Data      | Queries: each request, its call, its answer, and what a dependent one's input was from |
| Stores    | Store commands and refusals                                                            |
| Backend   | Spans the backend recorded                                                             |

A request that waited for another query's value draws that wait as a line before its bar, from
when the other was asked for to when this one started. Data that was already there (after a
preload, or going back) is a short `served` span that links to the trace that loaded it.

When three or more requests each waited for the one before, or when a request had the same input
as the one it waited for, the trace panel says so above the spans with the code
`SPAR_QUERY_CHAIN`, names the requests in order, and says which one looks avoidable. A chain of
two with different inputs, such as a report and then its author, is not reported.

An agent gets the same with `get_trace` and a `lens`, or `get_navigation` for the newest
route change, which also carries the chains. From a shell:

```sh
bun run --cwd packages/devtools-mcp cli trace --lens data
```

prints that navigation as an indented waterfall: each span, when it started, how long it took and
what it waited for. `--back 1` is the navigation before; `--id` takes a trace id.

## On the server

`Server.render` draws the page, waits until every query has settled, and draws again until a
pass finds nothing still loading. That covers queries inside a routed page or a list, which only
start once the page is drawn, and dependent ones. The queries' stores travel with the page like
any store's, so in the browser the first `ask` finds its data fresh and makes no request. Give a
query a `staleAfter` or the browser will ask again straight away.

The server boundary is one Effect RPC group and one service with two layers. On the server the
layer reads the database; in the browser it calls the group over `Backend.rpc`. The query's
`load` is the same code on both sides. `apps/ssr` shows it with a routed product page: its
browser test fails unless the page arrives with what its two queries loaded, the browser asks for
none of it again, a link to another product makes exactly two calls in one trace that reaches the
database's spans, and going back loads no new document.

### Sending a page in pieces

`Server.render` and `renderToStream` wait for every query, so the page arrives complete and
works without JavaScript. `Server.renderInPieces` does not wait:

```ts
Server.renderInPieces(Site, {
  layer: layer(url),
  open,
  close: "</div>",
  script: '<script type="module" async src="/client.js"></script>',
  end: "</body></html>",
})
```

It sends the page as first drawn, with each query showing its own `loading` or `waiting`
state, and the state it had then. The queries go on running on the server, dependent ones too,
and each time their stores change the new state follows as a small script. The browser hands each
piece to the query's store (the store's log shows it as `streamed`), the views update, and the
browser asks the backend for nothing. The whole response is one render in one trace. The server
code chooses per page which of the two to call.

What to know: the client script must be `async`, or the browser runs it only after the last
piece. Without JavaScript the page stays as first drawn. A query that is first asked for by a
component that only mounts once data is there (a row of a loaded list) is not run on the server;
the browser asks for it. If the connection drops part way, a query whose piece never came stays
`loading`.

From TanStack Start this takes: the same loading code on both sides, the cache sent with the page
and picked up in the browser, a typed server boundary, and a choice per page between a complete
page and one sent in pieces. It does not take: routes from files, or server functions made by a
compiler. What is sent in pieces is data, not HTML: the server does not send finished fragments to
swap in. There are no server components and no second kind of component.

## Not built

- Sending finished HTML for a piece, so a page sent in pieces fills in without JavaScript.
- A span for the code of a split page arriving.
