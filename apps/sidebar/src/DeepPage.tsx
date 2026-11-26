import { Effect, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
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

type Answer = AsyncResult.AsyncResult<Found, ServerUnreachable>

const foundIn = (result: Answer): Found | null => Option.getOrNull(AsyncResult.value(result))

const labelOf = (result: Answer): string => foundIn(result)?.label ?? ""

const statusOf = (result: Answer): string =>
  result.waiting
    ? "loading"
    : AsyncResult.match(result, {
        onInitial: () => "waiting",
        onFailure: () => "failed",
        onSuccess: () => "loaded",
      })

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
      label: Reactive.map(handle.result, labelOf),
      status: Reactive.map(handle.result, statusOf),
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
    Reactive.map(props.report.result, (result) => Option.fromNullishOr(foundIn(result)?.authorId)),
  ),
)((props) => (
  <section class="segment" aria-label="Report">
    <h1>
      <output aria-label="Report name">{Reactive.map(props.report.result, labelOf)}</output>
    </h1>
    <p>
      <output aria-label="Report status">{Reactive.map(props.report.result, statusOf)}</output>
    </p>
    <p>
      Written by{" "}
      <output aria-label="Author name">{Reactive.map(props.author.result, labelOf)}</output>{" "}
      <output aria-label="Author status">{Reactive.map(props.author.result, statusOf)}</output>
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
