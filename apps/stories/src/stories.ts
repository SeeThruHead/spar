import { Effect, Schema, SubscriptionRef, pipe } from "effect"
import { Form, Reactive, UiState, View } from "spar"
import { Dialog, Menu, Select, Tabs, Toast } from "@spar/ui"
import {
  ControlsView,
  DialogStoryView,
  MenuStoryView,
  TabsStoryView,
  TextView,
  ToastStoryView,
} from "./StoryViews.tsx"

const Profile = Schema.Struct({
  name: Schema.String.check(Schema.makeFilter((text) => text.trim().length > 0 || "Enter a name")),
  plan: Schema.String,
  news: Schema.Boolean,
})

const idle = Reactive.succeed(false)

export const Controls = View.connect(
  Effect.fnUntraced(function* () {
    const form = yield* Form.make(Profile, { name: "", plan: "team", news: false })
    const compact = yield* UiState.make(false)
    const saved = yield* SubscriptionRef.make("nothing yet")

    return {
      name: form.field("name"),
      plan: Select({
        id: "plan",
        label: "Plan",
        field: form.field("plan"),
        options: [
          { value: "free", label: "Free" },
          { value: "team", label: "Team" },
        ],
      }),
      news: form.field("news"),
      busy: form.submitting,
      compact,
      idle,
      saved: Reactive.fromSubscriptionRef(saved),
      onSubmit: form.submit((profile) =>
        SubscriptionRef.set(saved, `${profile.name} on the ${profile.plan} plan`),
      ),
      onToggleCompact: UiState.update(compact, (on) => !on),
      onReset: form.reset,
    }
  }),
)(ControlsView)

export const TabsStory = View.connect(
  Effect.fnUntraced(function* () {
    return {
      tabs: yield* View.child(Tabs, {
        label: "Project sections",
        tabs: [
          {
            id: "overview",
            title: "Overview",
            content: TextView({ text: "What the project is." }),
          },
          { id: "members", title: "Members", content: TextView({ text: "Who is on it." }) },
          { id: "billing", title: "Billing", content: TextView({ text: "What it costs." }) },
        ],
      }),
    }
  }),
)(TabsStoryView)

export const MenuStory = View.connect(
  Effect.fnUntraced(function* () {
    const chosen = yield* SubscriptionRef.make("none")

    return {
      chosen: Reactive.fromSubscriptionRef(chosen),
      menu: yield* View.child(Menu, {
        label: "More actions",
        items: [
          { label: "Rename", onChoose: SubscriptionRef.set(chosen, "Rename") },
          { label: "Duplicate", onChoose: SubscriptionRef.set(chosen, "Duplicate") },
          { label: "Archive", onChoose: SubscriptionRef.set(chosen, "Archive") },
        ],
      }),
    }
  }),
)(MenuStoryView)

export const DialogStory = View.connect(
  Effect.fnUntraced(function* () {
    const open = yield* UiState.make(false)

    return {
      idle,
      onOpen: UiState.set(open, true),
      dialog: yield* pipe(
        open,
        Reactive.when(Dialog, {
          id: "details",
          title: "Project details",
          content: TextView({ text: "Created last spring, three members, on the team plan." }),
          onClose: UiState.set(open, false),
        }),
      ),
    }
  }),
)(DialogStoryView)

export const ToastStory = View.connect(
  Effect.fnUntraced(function* () {
    const toasts = yield* Toast.Toasts

    return {
      idle,
      onNotify: toasts.show("Your changes are saved", "success"),
      onWarn: toasts.show("The server could not be reached", "problem"),
    }
  }),
)(ToastStoryView)
