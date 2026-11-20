import { Effect, Layer, Schema } from "effect"
import { Query, Router } from "spar"
import { RecordQuery } from "./AgentPage.tsx"
import { Found, ServerUnreachable } from "./api.ts"
import { Server } from "./server/Server.ts"

const lookup = (kind: string) => (id: string) =>
  Effect.flatMap(Effect.service(Server), (server) => server.lookup(kind, id))

const query = {
  input: Schema.String,
  success: Found,
  failure: ServerUnreachable,
  staleAfter: "30 seconds",
} as const

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

export const Org = Schema.Struct({ org: Schema.String })

export const Team = Schema.Struct({ ...Org.fields, team: Schema.String })

export const Member = Schema.Struct({ ...Team.fields, member: Schema.String })

export const Report = Schema.Struct({ ...Member.fields, report: Schema.String })

export const orgRoute = Router.route("/org/:org/*", Org)

export const teamRoute = Router.under(orgRoute, "/team/:team/*", Team)

export const memberRoute = Router.under(teamRoute, "/member/:member/*", Member)

export const reportsRoute = Router.under(memberRoute, "/reports/*", Member)

export const reportRoute = Router.under(reportsRoute, "/:report", Report)

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
