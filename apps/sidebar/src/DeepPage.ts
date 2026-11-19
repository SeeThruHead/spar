import { Effect, Option } from "effect"
import { Props, Reactive, Router, View } from "spar"
import type { Query } from "spar"
import type { Found, ServerUnreachable } from "./api.ts"
import {
  AuthorQuery,
  Member,
  MemberQuery,
  Org,
  OrgQuery,
  Report,
  ReportQuery,
  ReportsQuery,
  Team,
  TeamQuery,
  memberRoute,
  reportRoute,
  reportsRoute,
  teamRoute,
} from "./Deep.ts"
import { DeepMissingView, ReportView, SegmentView } from "./DeepView.tsx"

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
