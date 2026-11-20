import { Effect, Option } from "effect"
import { Props, Reactive, Router, compose, withProps, withQuery } from "spar"
import type { Query, View } from "spar"
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
import { DeepMissingView, SegmentView } from "./DeepView.tsx"

const labelOf = (found: Found | null): string => found?.label ?? ""

type Asked<R> = {
  readonly ask: (
    input: Query.Input<string>,
  ) => Effect.Effect<Query.Handle<Found, ServerUnreachable>, never, R>
}

const withSegment =
  <Params, R>(kind: string, query: Asked<R>, pick: (params: Params) => string) =>
  (props: { readonly params: Reactive.Reactive<Params> }) =>
    Effect.map(query.ask(Reactive.map(props.params, pick)), (handle) => ({
      kind,
      label: Reactive.map(handle.value, labelOf),
      status: handle.status,
    }))

const withInner =
  <Params, Path extends string, R>(
    route: Router.Route<Params, Path>,
    page: View.Component<{ readonly params: Reactive.Reactive<Params> }, never, R>,
  ) =>
  () =>
    Effect.map(
      Router.outlet({ routes: [Router.live(route, page)], otherwise: DeepMissingView }),
      (inner) => ({ inner }),
    )

const ReportPage = compose(
  withProps({ params: Props.Reactive(Report) }),
  withQuery("report", ReportQuery, (props) => Reactive.map(props.params, (now) => now.report)),
  withQuery("author", AuthorQuery, (props) =>
    Reactive.map(props.report.value, (found) => Option.fromNullishOr(found?.authorId)),
  ),
)((props) => (
  <section class="segment" aria-label="Report">
    <h1>
      <output aria-label="Report name">{Reactive.map(props.report.value, labelOf)}</output>
    </h1>
    <p>
      <output aria-label="Report status">{props.report.status}</output>
    </p>
    <p>
      Written by{" "}
      <output aria-label="Author name">{Reactive.map(props.author.value, labelOf)}</output>{" "}
      <output aria-label="Author status">{props.author.status}</output>
    </p>
  </section>
))

const Reports = compose(
  withProps({ params: Props.Reactive(Member) }),
  withSegment("Reports", ReportsQuery, (now: typeof Member.Type) => now.member),
  withInner(reportRoute, ReportPage),
)(SegmentView)

const MemberSegment = compose(
  withProps({ params: Props.Reactive(Member) }),
  withSegment("Member", MemberQuery, (now: typeof Member.Type) => now.member),
  withInner(reportsRoute, Reports),
)(SegmentView)

const TeamSegment = compose(
  withProps({ params: Props.Reactive(Team) }),
  withSegment("Team", TeamQuery, (now: typeof Team.Type) => now.team),
  withInner(memberRoute, MemberSegment),
)(SegmentView)

export const OrgSegment = compose(
  withProps({ params: Props.Reactive(Org) }),
  withSegment("Organisation", OrgQuery, (now: typeof Org.Type) => now.org),
  withInner(teamRoute, TeamSegment),
)(SegmentView)
