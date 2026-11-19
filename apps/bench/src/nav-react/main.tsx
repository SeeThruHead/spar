import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useSuspenseQuery,
} from "@tanstack/react-query"
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { lookup, target } from "../nav-shared/lookup.ts"

const queryClient = new QueryClient()

const found = (kind: string, id: string) =>
  queryOptions({
    queryKey: [kind, id],
    queryFn: () => lookup(kind, id),
    staleTime: 30_000,
  })

const Segment = ({ kind, id }: { readonly kind: string; readonly id: string }): ReactNode => {
  const { data } = useSuspenseQuery(found(kind, id))

  return (
    <section>
      <p>
        {kind} <output data-kind={kind}>{data.label}</output>
      </p>
      <Outlet />
    </section>
  )
}

const rootRoute = createRootRoute({
  component: () => (
    <main>
      <Outlet />
    </main>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <p>
      <Link
        id="go"
        to="/org/$org/team/$team/member/$member/reports/$report"
        params={target}
        preload={false}
      >
        Open the report
      </Link>
    </p>
  ),
})

const orgRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "org/$org",
  loader: ({ params }) => queryClient.ensureQueryData(found("org", params.org)),
  component: function Org() {
    return <Segment kind="org" id={orgRoute.useParams().org} />
  },
})

const teamRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "team/$team",
  loader: ({ params }) => queryClient.ensureQueryData(found("team", params.team)),
  component: function Team() {
    return <Segment kind="team" id={teamRoute.useParams().team} />
  },
})

const memberRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: "member/$member",
  loader: ({ params }) => queryClient.ensureQueryData(found("member", params.member)),
  component: function Member() {
    return <Segment kind="member" id={memberRoute.useParams().member} />
  },
})

const reportsRoute = createRoute({
  getParentRoute: () => memberRoute,
  path: "reports",
  loader: ({ params }) => queryClient.ensureQueryData(found("reports", params.member)),
  component: function Reports() {
    return <Segment kind="reports" id={reportsRoute.useParams().member} />
  },
})

const reportRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "$report",
  loader: async ({ params }) => {
    const report = await queryClient.ensureQueryData(found("report", params.report))

    return queryClient.ensureQueryData(found("author", report.authorId ?? ""))
  },
  component: function Report() {
    const report = useSuspenseQuery(found("report", reportRoute.useParams().report))
    const author = useSuspenseQuery(found("author", report.data.authorId ?? ""))

    return (
      <section>
        <h1>{report.data.label}</h1>
        <p>
          Written by <output id="author">{author.data.label}</output>
        </p>
      </section>
    )
  },
})

const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    orgRoute.addChildren([
      teamRoute.addChildren([memberRoute.addChildren([reportsRoute.addChildren([reportRoute])])]),
    ]),
  ]),
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")

if (root !== null) {
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
