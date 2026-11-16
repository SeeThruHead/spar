import { Effect } from "effect"
import { Handle, Router, View } from "spar"
import { Toast } from "@spar/ui"
import { Controls, DialogStory, MenuStory, TabsStory, ToastStory } from "./stories.ts"
import { LinkView, MissingView, ShellView, WelcomeView } from "./StoryViews.tsx"

const home = Router.route("/")
const controls = Router.route("/controls")
const tabs = Router.route("/tabs")
const menu = Router.route("/menu")
const dialog = Router.route("/dialog")
const toast = Router.route("/toast")

export const Shell = View.connect(
  Effect.fnUntraced(function* () {
    const router = yield* Router.Router
    const main = yield* Handle.make

    yield* Router.focusOnChange(main)

    return {
      main,
      links: [
        LinkView({ title: "Form controls", link: router.link(controls, {}) }),
        LinkView({ title: "Tabs", link: router.link(tabs, {}) }),
        LinkView({ title: "Menu", link: router.link(menu, {}) }),
        LinkView({ title: "Dialog", link: router.link(dialog, {}) }),
        LinkView({ title: "Toasts", link: router.link(toast, {}) }),
      ],
      page: yield* Router.outlet({
        routes: [
          Router.on(home, WelcomeView),
          Router.on(controls, Controls),
          Router.on(tabs, TabsStory),
          Router.on(menu, MenuStory),
          Router.on(dialog, DialogStory),
          Router.on(toast, ToastStory),
        ],
        otherwise: MissingView,
      }),
      toasts: yield* View.child(Toast.Viewport, {}),
    }
  }),
)(ShellView)
