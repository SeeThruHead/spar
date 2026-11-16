import { Effect } from "effect"
import { Handle, Router, View } from "spar"
import { Toast } from "@spar/ui"
import { AgentPage } from "./AgentPage.ts"
import { agentRoute, home } from "./routes.ts"
import { Sidebar } from "./Sidebar.ts"
import { EmptyPageView, MissingPageView, ShellView } from "./SidebarView.tsx"

export const Shell = View.connect(
  Effect.fnUntraced(function* () {
    const main = yield* Handle.make

    yield* Router.focusOnChange(main)

    return {
      main,
      sidebar: yield* View.child(Sidebar, {}),
      page: yield* Router.outlet({
        routes: [Router.on(home, EmptyPageView), Router.on(agentRoute, AgentPage)],
        otherwise: MissingPageView,
      }),
      toasts: yield* View.child(Toast.Viewport, {}),
    }
  }),
)(ShellView)
