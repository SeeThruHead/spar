import { Effect } from "effect"
import { Handle, Router, View } from "spar"
import { Toast } from "@spar/ui"
import { AgentPage } from "./AgentPage.ts"
import { deepExample, orgRoute, reportRoute } from "./Deep.ts"
import { DeepLoadingView } from "./DeepLoadingView.tsx"
import { Notes } from "./Notes.ts"
import { People } from "./People.ts"
import { ResetCounter } from "./ResetCounter.ts"
import { agentRoute, home } from "./routes.ts"
import { Sidebar } from "./Sidebar.ts"
import { EmptyPageView, MissingPageView, ShellView } from "./SidebarView.tsx"

export const Shell = View.connect(
  Effect.fnUntraced(function* () {
    const main = yield* Handle.make
    const router = yield* Router.Router

    yield* Router.focusOnChange(main)

    return {
      main,
      sidebar: yield* View.child(Sidebar, {}),
      deep: router.link(reportRoute, deepExample),
      scratch: yield* View.child(Notes, { id: "scratch-note", title: "Scratchpad" }),
      counter: yield* View.child(ResetCounter, {}),
      people: yield* View.child(People, {}),
      page: yield* Router.outlet({
        routes: [
          Router.on(home, EmptyPageView),
          Router.on(agentRoute, AgentPage),
          Router.live(
            orgRoute,
            View.split(DeepLoadingView, () =>
              import("./DeepPage.ts").then((module) => module.OrgSegment),
            ),
          ),
        ],
        otherwise: MissingPageView,
      }),
      toasts: yield* View.child(Toast.Viewport, {}),
    }
  }),
)(ShellView)
