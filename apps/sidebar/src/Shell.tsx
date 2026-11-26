import { Effect } from "effect"
import { Handle, Router, View, compose, withEffect, withProps, withStore } from "spar"
import { Toast } from "@spar/ui"
import { AgentPage } from "./AgentPage.tsx"
import { deepExample, orgRoute, reportRoute } from "./Deep.ts"
import { DeepLoadingView } from "./DeepLoadingView.tsx"
import { Notes } from "./Notes.tsx"
import { People } from "./PeoplePanel.tsx"
import { ResetCounter } from "./ResetCounter.tsx"
import { agentRoute, home } from "./routes.ts"
import { Sidebar } from "./Sidebar.ts"
import { EmptyPageView, MissingPageView } from "./SidebarView.tsx"

const withMain = () => Effect.map(Handle.make, (main) => ({ main }))

const withPage = () =>
  Effect.map(
    Router.outlet({
      routes: [
        Router.on(home, EmptyPageView),
        Router.on(agentRoute, AgentPage),
        Router.live(
          orgRoute,
          View.split(DeepLoadingView, () =>
            import("./DeepPage.tsx").then((module) => module.OrgSegment),
          ),
        ),
      ],
      otherwise: MissingPageView,
    }),
    (page) => ({ page }),
  )

export const Shell = compose(
  withProps({}),
  withMain,
  withEffect((props) => Router.focusOnChange(props.main)),
  withStore(Router.Router, (router) => ({ deep: router.link(reportRoute, deepExample) })),
  withPage,
)((props) => (
  <div class="shell">
    <header class="topbar">
      <strong class="brand">Spar showcase</strong>
      <a
        href={props.deep.href}
        onClick={props.deep.onClick}
        onPointerenter={props.deep.onIntent}
        onFocus={props.deep.onIntent}
      >
        Open a page five segments deep
      </a>
    </header>
    <Sidebar />
    <main ref={props.main} tabIndex={-1}>
      <div class="page">{props.page}</div>
      <div class="features">
        <Notes id="scratch-note" title="Scratchpad" />
        <ResetCounter />
        <People />
      </div>
    </main>
    <Toast.Viewport />
  </div>
))
