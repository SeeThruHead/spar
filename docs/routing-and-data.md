# Routes, data and no waterfalls

The short version: declare the data a component needs in that component, pass values down as
props the way you always would, and Spar loads everything that can load at once. You do not write
loaders, fragments or lists of dependencies.

## Start here: a prop from a store, a query that uses it

A parent reads a value from a store and passes it to a child. The child declares a query that
uses the prop.

<<< packages/spar/test/serverData.test.tsx#OrdersQuery

<<< packages/spar/test/serverData.test.tsx#Orders

<<< packages/spar/test/serverData.test.tsx#Parent

That is the whole of it. Provide `OrdersQuery.live` where the app is mounted and it works.

What Spar does with it:

1. `ask` (which `withQuery` calls) returns at once with a handle: `status`, `value`, `error`,
   `loading`, each a reactive value, and `refetch`. No enhancer waits for data.
2. Because nothing waits, the parent goes straight on to draw its children, and they draw theirs.
   Every query in the tree is reached in one pass, and every query with an input starts then,
   together.
3. The query runs in its store, which lives at the root. The component can unmount and the
   answer still arrives and is kept. Two components that ask for the same input share one
   request.
4. When the prop changes, the query for the new value starts. An input that was loaded recently
   enough (`staleAfter`) is shown from the cache with no request.

A query that needs another query's answer takes its input from that answer:

<<< apps/sidebar/src/DeepPage.tsx#ReportPage

While the input is none the author query is `waiting`. The moment the report answers, it starts.
That is the only waterfall Spar allows, it is the one the data really has, and it shows: as the
`waiting` status, and in the trace, where the author's request says "input from Report . value".

The one rule: pass a changing value down as the reactive value it is (`Props.Reactive`), which is
how Spar passes changing values anyway. If you read it out into a plain number first, the child's
query cannot follow it when it changes.

## Routes

A route is a path and a Schema. Fields named in the path are path params; every other field is a
search param. Links and navigation take the decoded params, so a wrong param is a type error.

<<< apps/sidebar/src/Deep.ts#orgRoute

A link is `router.link(route, params)`, with the params typed by the route's Schema.

A route inside another is declared under it, so its path is written once. The parent must end
with `/*`, and the Schema must carry every param of the whole path; both are compile errors
otherwise:

<<< apps/sidebar/src/Deep.ts#teamRoute

<<< apps/sidebar/src/Deep.ts#memberRoute

Segments nest with open-ended routes and an outlet in each layout. `Router.live` keeps a layout
mounted while only its params change and gives it the params as a reactive value, which is what a
query wants as its input. In the showcase each segment asks for its own data from its params and
places the next segment's outlet:

<<< apps/sidebar/src/DeepPage.tsx#withInner

<<< apps/sidebar/src/DeepPage.tsx#OrgSegment

There is no separate route tree to keep in step: the nesting is the outlets, and the paths follow
from `under`.

A page five segments deep written this way starts all five segments' requests together. The
showcase has one (`apps/sidebar/src/Deep.ts`), and its browser check reads the backend's own
spans and fails if the five do not start together or if the sixth does not wait for the one it
needs (`apps/sidebar/scripts/deep.ts`).

## Preload on intent

A link has `onIntent`. Put it on the anchor (`onPointerenter={link.onIntent}` and
`onFocus={link.onIntent}`, beside `href={link.href}` and `onClick={link.onClick}`) and pointing at
the link, or focusing it, starts the target page's queries before the click.

Spar rehearses the target: it mounts the app at that address without drawing anything, which
reaches every `ask` on the way, and throws the result away. The queries are real and their answers
stay in their stores, so the click finds the data there. Leave `onIntent` off a link whose page
should not be preloaded. `router.preload(route, params)` does the same from code.

Links you did not write as JSX, such as the ones in trusted markup rendered from markdown, follow
in place when their container has `onClick={router.followLinks}`. A plain click on a link to this
site goes through the router; a link to another site, one with `target` or `download`, a link to
a heading on the same page, and a click with a modifier key are left to the browser.

## Loading a page's code when it is first shown

<<< apps/sidebar/src/Shell.tsx#withPage

`View.split` shows the placeholder, a view that takes the same props, until the code has
arrived. Routes, param Schemas and query classes stay in the main bundle because the query layers
are provided at the root; the components and their views are what is split off. Preloading a link
fetches the code too, since the rehearsal mounts the page. On the server and while taking over a
server-drawn page the real component is used, not the placeholder. The showcase's deep page is
loaded this way, as above.

## Pending and failure, per segment

Each segment shows its own query's `status`, so one slow segment does not blank the others. For
a component whose own Effect can wait or fail, `View.pending(placeholder)` and
`View.recover(failure, view)` wrap that component alone. A query takes `retry`, a schedule,
and stays `loading` until the schedule gives up.

## What makes a waterfall, and how Spar stops it

One thing: a component whose Effect waits. Everything below it mounts late, so their queries
start late.

- The build refuses a wait written straight into an enhancer inside `compose(...)`: `yield*` of
  `Effect.sleep`, `Effect.promise`, `Effect.tryPromise`, `Effect.callback`, `Deferred.await`,
  `Fiber.join` (rule `no-waiting-in-components`). A wait in a handler, in a service's Effect or
  anywhere outside a component is fine.
- The build cannot see a wait behind a call such as `yield* server.describe(name)`, or in an
  enhancer written outside the `compose(...)` call. For that,
  any component that takes a frame or more before its children can mount gets a `waited` entry in
  the log with its name and the milliseconds, and `spar.waited_ms` on its span.

Forbidden, in short: fetching in a component's Effect (ask a query), and passing server data down
through props (the component that needs it asks for it, or a store's action reads the query with
`TheQuery.read(input)`).

## Seeing it

One navigation is one trace, whether it started with a link, `router.go` or the browser's Back
and Forward buttons (those run in a span named `Router.popstate`): the click, the route change, each segment mounting, each query's
request, the calls they make, the backend's spans, and each answer landing. In the devtools trace
panel, lenses show one kind at a time:

| Lens      | What it keeps                                                                          |
| --------- | -------------------------------------------------------------------------------------- |
| Rendering | Components mounting, and each event a component handled (`on click`, with its view)    |
| Data      | Queries: each request, its call, its answer, and what a dependent one's input was from |
| Stores    | Store commands                                                                         |
| Backend   | Spans the backend recorded                                                             |

A request that waited for another query's value draws that wait as a line before its bar, from
when the other was asked for to when this one started. Data that was already there (after a
preload, or going back) is a short `<query key>/served` span that links to the trace that loaded it.

Hovering a link and then clicking it follows one rule. Hovering starts the target page's
queries in the hover's own trace. When the click asks for the same queries, nothing is asked
again, whether the hover's requests have answered or are still on their way. The click's
trace gets a `served` span for each one, saying "served from what trace … loaded" and linking
to the hover's trace. So each request is recorded once, in the trace that started it, and the
click's trace says where its data came from.

When three or more requests each waited for the one before, or when a request had the same input
as the one it waited for, the trace panel says so above the spans with the code
`SPAR_QUERY_CHAIN`, names the requests in order with how long after the one before each started, and says which one
looks avoidable. A chain of
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
any store's, so in the browser the first `ask` finds its data and makes no request. Data the
server or a link preload loaded is used once by the first `ask` that wants it, whatever the
query's `staleAfter`; asks after that follow `staleAfter`, which is 500 ms unless set (give
`"0 millis"` to ask again every time).

The server boundary is one Effect RPC group and one service with two layers. On the server the
layer reads the database; in the browser it calls the group over `Backend.rpc`. The query's
`load` is the same code on both sides. `apps/ssr` shows it with a routed product page: its
browser test fails unless the page arrives with what its two queries loaded, the browser asks for
none of it again, a link to another product makes exactly two calls in one trace that reaches the
database's spans, and going back loads no new document.

### Sending a page in pieces

`Server.render` and `renderToStream` wait for every query, so the page arrives complete and
works without JavaScript. `Server.renderInPieces` does not wait:

<<< apps/ssr/scripts/site.ts#inPieces

It sends the page as first drawn, with each query showing its own `loading` or `waiting`
state, and the state it had then. The queries go on running on the server, dependent ones too,
and each time their stores change the new state follows as a small script. The browser hands each
piece to the query's store (the store's log shows it as `streamed`), the views update, and the
browser asks the backend for nothing. The whole response is one render in one trace. The server
code chooses per page which of the two to call.

Each data piece is followed by the parts of the page that data changed. The server draws the page
again, compares each component with what it last sent, and sends only the components whose own
markup changed, each as finished HTML in a `<template>` with a one-line script that puts it
between that component's two marks. In a page sent in pieces every component is wrapped in
`<!--spar(-->` and `<!--spar)-->`, and the takeover removes the marks as it reaches them, without
making any node again. A slow supplier on a product page arrives as the product's component
alone, not the page around it. When what changed is outside every component, the whole root
(`#root`, or the `root` option's selector) is sent instead. Each round is a `Server.piece` span
in the trace of the render, with how many parts it sent. The script does nothing once the app has
started taking the page over (the root is marked `data-spar-taken`), so the server's HTML never
lands on a page the app is drawing.
So a slow or blocked bundle still leaves the reader with the finished page, and when the bundle
does arrive, the pieces that came before it are applied before its first draw, so it takes over
the finished page as it is.

What to know: the client script must be `async`, or the browser runs it only after the last
piece. With scripts turned off, the pieces cannot run, so each round that changed the page also
sends the whole page as drawn so far inside `<noscript>`, which such a browser shows; a style
sent with the first draw shows only the newest round and hides the page as first drawn. The page
then fills in round by round, every component in its place. A browser with scripts on reads
`<noscript>` as text and uses the pieces. While pieces are still coming the browser does not ask for data it lacks; the last piece says the
server is done, and whatever is still missing then is asked for by the browser. That covers a
query first asked for by a component that only mounts once data is there (a row of a loaded
list), which the server does not run. If the connection drops part way, the document ends without that last piece; the browser
notices the end and asks for what is missing itself.

From TanStack Start this takes: the same loading code on both sides, the cache sent with the page
and picked up in the browser, a typed server boundary, and a choice per page between a complete
page and one sent in pieces. It does not take: routes from files, or server functions made by a
compiler. What is sent in pieces is data and the finished HTML of each component it changed, drawn
by the same components the browser runs. There are no server components and no second kind of
component.

## Not built

- A span for the code of a split page arriving.
