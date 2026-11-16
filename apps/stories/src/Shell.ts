import { Effect } from "effect"
import { Handle, Router, View } from "spar"
import { Toast } from "@spar/ui"
import {
  Controls,
  DialogStory,
  ListboxStory,
  MenuStory,
  PopoverStory,
  TabsStory,
  ToastStory,
  TooltipStory,
} from "./stories.ts"
import { LinkView, MissingView, ShellView, WelcomeView } from "./StoryViews.tsx"

const home = Router.route("/")
const controls = Router.route("/controls")
const tabs = Router.route("/tabs")
const menu = Router.route("/menu")
const dialog = Router.route("/dialog")
const toast = Router.route("/toast")
const tooltip = Router.route("/tooltip")
const popover = Router.route("/popover")
const listbox = Router.route("/listbox")

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
        LinkView({ title: "Tooltip", link: router.link(tooltip, {}) }),
        LinkView({ title: "Popover", link: router.link(popover, {}) }),
        LinkView({ title: "Listbox", link: router.link(listbox, {}) }),
      ],
      page: yield* Router.outlet({
        routes: [
          Router.on(home, WelcomeView),
          Router.on(controls, Controls),
          Router.on(tabs, TabsStory),
          Router.on(menu, MenuStory),
          Router.on(dialog, DialogStory),
          Router.on(toast, ToastStory),
          Router.on(tooltip, TooltipStory),
          Router.on(popover, PopoverStory),
          Router.on(listbox, ListboxStory),
        ],
        otherwise: MissingView,
      }),
      toasts: yield* View.child(Toast.Viewport, {}),
    }
  }),
)(ShellView)
