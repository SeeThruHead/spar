import { Effect, Layer, Option, Schema } from "effect"
import { Props, Query, Reactive, Router, View } from "spar"
import { lookup, target } from "../nav-shared/lookup.ts"
import { HomeView, NothingView, ReportView, SegmentView, ShellView } from "./NavView.tsx"

const Found = Schema.Struct({ label: Schema.String, authorId: Schema.NullOr(Schema.String) })

type Found = typeof Found.Type

const load = (kind: string) => (id: string) => Effect.promise(() => lookup(kind, id))

const query = { input: Schema.String, success: Found, failure: Schema.Never } as const

class OrgQuery extends Query.Tag<OrgQuery>()("nav/Org", { ...query, load: load("org") }) {}

class TeamQuery extends Query.Tag<TeamQuery>()("nav/Team", { ...query, load: load("team") }) {}

class MemberQuery extends Query.Tag<MemberQuery>()("nav/Member", {
  ...query,
  load: load("member"),
}) {}

class ReportsQuery extends Query.Tag<ReportsQuery>()("nav/Reports", {
  ...query,
  load: load("reports"),
}) {}

class ReportQuery extends Query.Tag<ReportQuery>()("nav/Report", {
  ...query,
  load: load("report"),
}) {}

class AuthorQuery extends Query.Tag<AuthorQuery>()("nav/Author", {
  ...query,
  load: load("author"),
}) {}

export const queries = Layer.mergeAll(
  OrgQuery.live,
  TeamQuery.live,
  MemberQuery.live,
  ReportsQuery.live,
  ReportQuery.live,
  AuthorQuery.live,
)

const Org = Schema.Struct({ org: Schema.String })

const Team = Schema.Struct({ ...Org.fields, team: Schema.String })

const Member = Schema.Struct({ ...Team.fields, member: Schema.String })

const Report = Schema.Struct({ ...Member.fields, report: Schema.String })

const home = Router.route("/")

const orgRoute = Router.route("/org/:org/*", Org)

const teamRoute = Router.route("/org/:org/team/:team/*", Team)

const memberRoute = Router.route("/org/:org/team/:team/member/:member/*", Member)

const reportsRoute = Router.route("/org/:org/team/:team/member/:member/reports/*", Member)

const reportRoute = Router.route("/org/:org/team/:team/member/:member/reports/:report", Report)

const labelOf = (found: Found | null): string => found?.label ?? ""

const ReportPage = View.taking(
  { params: Props.Reactive(Report) },
  Effect.fnUntraced(function* ({ params }) {
    const report = yield* ReportQuery.ask(Reactive.map(params, (now) => now.report))
    const author = yield* AuthorQuery.ask(
      Reactive.map(report.value, (found) => Option.fromNullishOr(found?.authorId)),
    )

    return {
      label: Reactive.map(report.value, labelOf),
      author: Reactive.map(author.value, labelOf),
    }
  }),
)(ReportView)

const Reports = View.taking(
  { params: Props.Reactive(Member) },
  Effect.fnUntraced(function* ({ params }) {
    const reports = yield* ReportsQuery.ask(Reactive.map(params, (now) => now.member))

    return {
      kind: "reports",
      label: Reactive.map(reports.value, labelOf),
      inner: yield* Router.outlet({
        routes: [Router.live(reportRoute, ReportPage)],
        otherwise: NothingView,
      }),
    }
  }),
)(SegmentView)

const MemberSegment = View.taking(
  { params: Props.Reactive(Member) },
  Effect.fnUntraced(function* ({ params }) {
    const member = yield* MemberQuery.ask(Reactive.map(params, (now) => now.member))

    return {
      kind: "member",
      label: Reactive.map(member.value, labelOf),
      inner: yield* Router.outlet({
        routes: [Router.live(reportsRoute, Reports)],
        otherwise: NothingView,
      }),
    }
  }),
)(SegmentView)

const TeamSegment = View.taking(
  { params: Props.Reactive(Team) },
  Effect.fnUntraced(function* ({ params }) {
    const team = yield* TeamQuery.ask(Reactive.map(params, (now) => now.team))

    return {
      kind: "team",
      label: Reactive.map(team.value, labelOf),
      inner: yield* Router.outlet({
        routes: [Router.live(memberRoute, MemberSegment)],
        otherwise: NothingView,
      }),
    }
  }),
)(SegmentView)

const OrgSegment = View.taking(
  { params: Props.Reactive(Org) },
  Effect.fnUntraced(function* ({ params }) {
    const org = yield* OrgQuery.ask(Reactive.map(params, (now) => now.org))

    return {
      kind: "org",
      label: Reactive.map(org.value, labelOf),
      inner: yield* Router.outlet({
        routes: [Router.live(teamRoute, TeamSegment)],
        otherwise: NothingView,
      }),
    }
  }),
)(SegmentView)

const Home = View.connect(
  Effect.fnUntraced(function* () {
    const router = yield* Router.Router

    return { go: router.link(reportRoute, target) }
  }),
)(HomeView)

export const Shell = View.connect(
  Effect.fnUntraced(function* () {
    return {
      page: yield* Router.outlet({
        routes: [Router.on(home, Home), Router.live(orgRoute, OrgSegment)],
        otherwise: NothingView,
      }),
    }
  }),
)(ShellView)
