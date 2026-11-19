import { Effect, Layer, Option, Schema } from "effect"
import { Props, Query, Reactive, Router, View } from "spar"
import { RecordQuery } from "./AgentPage.ts"
import { Found, ServerUnreachable } from "./api.ts"
import { DeepMissingView, ReportView, SegmentView } from "./DeepView.tsx"
import { Server } from "./server/Server.ts"

const lookup = (kind: string) => (id: string) =>
  Effect.flatMap(Effect.service(Server), (server) => server.lookup(kind, id))

const query = { input: Schema.String, success: Found, failure: ServerUnreachable } as const

export class OrgQuery extends Query.Tag<OrgQuery>()("sidebar/Org", {
  ...query,
  load: lookup("org"),
}) {}

export class TeamQuery extends Query.Tag<TeamQuery>()("sidebar/Team", {
  ...query,
  load: lookup("team"),
}) {}

export class MemberQuery extends Query.Tag<MemberQuery>()("sidebar/Member", {
  ...query,
  load: lookup("member"),
}) {}

export class ReportsQuery extends Query.Tag<ReportsQuery>()("sidebar/Reports", {
  ...query,
  load: lookup("reports"),
}) {}

export class ReportQuery extends Query.Tag<ReportQuery>()("sidebar/Report", {
  ...query,
  load: lookup("report"),
}) {}

export class AuthorQuery extends Query.Tag<AuthorQuery>()("sidebar/Author", {
  ...query,
  load: lookup("author"),
}) {}

const Org = Schema.Struct({ org: Schema.String })

const Team = Schema.Struct({ ...Org.fields, team: Schema.String })

const Member = Schema.Struct({ ...Team.fields, member: Schema.String })

const Report = Schema.Struct({ ...Member.fields, report: Schema.String })

export const orgRoute = Router.route("/org/:org/*", Org)

export const teamRoute = Router.route("/org/:org/team/:team/*", Team)

export const memberRoute = Router.route("/org/:org/team/:team/member/:member/*", Member)

export const reportsRoute = Router.route("/org/:org/team/:team/member/:member/reports/*", Member)

export const reportRoute = Router.route(
  "/org/:org/team/:team/member/:member/reports/:report",
  Report,
)

const labelOf = (found: Found | null): string => found?.label ?? ""

const shown = (handle: Query.Handle<Found, ServerUnreachable>) => ({
  label: Reactive.map(handle.value, labelOf),
  status: handle.status,
})

const ReportPage = View.taking(
  { params: Props.Reactive(Report) },
  Effect.fnUntraced(function* ({ params }) {
    const report = yield* ReportQuery.ask(Reactive.map(params, (now) => now.report))
    const author = yield* AuthorQuery.ask(
      Reactive.map(report.value, (found) => Option.fromNullishOr(found?.authorId)),
    )

    return {
      ...shown(report),
      author: Reactive.map(author.value, labelOf),
      authorStatus: author.status,
    }
  }),
)(ReportView)

const Reports = View.taking(
  { params: Props.Reactive(Member) },
  Effect.fnUntraced(function* ({ params }) {
    const reports = yield* ReportsQuery.ask(Reactive.map(params, (now) => now.member))

    return {
      kind: "Reports",
      ...shown(reports),
      inner: yield* Router.outlet({
        routes: [Router.live(reportRoute, ReportPage)],
        otherwise: DeepMissingView,
      }),
    }
  }),
)(SegmentView)

const MemberSegment = View.taking(
  { params: Props.Reactive(Member) },
  Effect.fnUntraced(function* ({ params }) {
    const member = yield* MemberQuery.ask(Reactive.map(params, (now) => now.member))

    return {
      kind: "Member",
      ...shown(member),
      inner: yield* Router.outlet({
        routes: [Router.live(reportsRoute, Reports)],
        otherwise: DeepMissingView,
      }),
    }
  }),
)(SegmentView)

const TeamSegment = View.taking(
  { params: Props.Reactive(Team) },
  Effect.fnUntraced(function* ({ params }) {
    const team = yield* TeamQuery.ask(Reactive.map(params, (now) => now.team))

    return {
      kind: "Team",
      ...shown(team),
      inner: yield* Router.outlet({
        routes: [Router.live(memberRoute, MemberSegment)],
        otherwise: DeepMissingView,
      }),
    }
  }),
)(SegmentView)

export const OrgSegment = View.taking(
  { params: Props.Reactive(Org) },
  Effect.fnUntraced(function* ({ params }) {
    const org = yield* OrgQuery.ask(Reactive.map(params, (now) => now.org))

    return {
      kind: "Organisation",
      ...shown(org),
      inner: yield* Router.outlet({
        routes: [Router.live(teamRoute, TeamSegment)],
        otherwise: DeepMissingView,
      }),
    }
  }),
)(SegmentView)

export const deepQueries = Layer.mergeAll(
  RecordQuery.live,
  OrgQuery.live,
  TeamQuery.live,
  MemberQuery.live,
  ReportsQuery.live,
  ReportQuery.live,
  AuthorQuery.live,
)

export const deepExample = {
  org: "acme",
  team: "core",
  member: "ada",
  report: "q3",
} as const
