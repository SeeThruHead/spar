import { Effect, Schema, pipe } from "effect"
import { Form, Reactive, Store, UiState, View, compose } from "spar"
import { Combobox, Dialog, Listbox, Menu, Popover, Select, Tabs, Toast, Tooltip } from "@spar/ui"
import {
  ComboboxStoryView,
  ControlsView,
  DialogStoryView,
  ListboxStoryView,
  MenuStoryView,
  PopoverStoryView,
  TooltipStoryView,
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

class Saved extends Store.Tag<Saved>()("stories/Saved", {
  state: Schema.String,
  initialState: "nothing yet",
  actions: {
    saved: Store.action(Schema.String, (_before: string, text) => text),
  },
  selectors: {
    text: Store.selector(Schema.String, (text: string) => text),
  },
}) {}

const ControlsForm = compose(
  Effect.fnUntraced(function* () {
    const store = yield* Saved
    const form = yield* Form.make(Profile, { name: "", plan: "team", news: false })
    const compact = yield* UiState.make("compact", Schema.Boolean, false)

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
      saved: store.select.text,
      onSubmit: form.submit((profile) =>
        store.commands.saved(`${profile.name} on the ${profile.plan} plan`),
      ),
      onToggleCompact: UiState.update(compact, (on) => !on),
      onReset: form.reset,
    }
  }),
)(ControlsView)

export const Controls = Saved.with(ControlsForm)

export const TabsStory = compose(
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

export const MenuStory = compose(
  Effect.fnUntraced(function* () {
    const chosen = yield* UiState.make("chosen", Schema.String, "none")

    return {
      chosen,
      menu: yield* View.child(Menu, {
        label: "More actions",
        text: "More actions",
        items: [
          { label: "Rename", onChoose: UiState.set(chosen, "Rename") },
          { label: "Duplicate", onChoose: UiState.set(chosen, "Duplicate") },
          { label: "Archive", onChoose: UiState.set(chosen, "Archive") },
        ],
      }),
    }
  }),
)(MenuStoryView)

export const DialogStory = compose(
  Effect.fnUntraced(function* () {
    const open = yield* UiState.make("open", Schema.Boolean, false)

    return {
      idle,
      onOpen: UiState.set(open, true),
      dialog: yield* pipe(
        open,
        Reactive.when(
          Dialog(
            { id: "details", title: "Project details" },
            View.child(TextView, {
              text: "Created last spring, three members, on the team plan.",
            }),
          ),
          { onClose: UiState.set(open, false) },
        ),
      ),
    }
  }),
)(DialogStoryView)

export const ToastStory = compose(
  Effect.fnUntraced(function* () {
    const toasts = yield* Toast.Toasts

    return {
      idle,
      onNotify: toasts.show("Your changes are saved", "success"),
      onWarn: toasts.show("The server could not be reached", "problem"),
    }
  }),
)(ToastStoryView)

export const TooltipStory = compose(
  Effect.fnUntraced(function* () {
    return { tip: yield* Tooltip.make("Removes the project for everyone on the team") }
  }),
)(TooltipStoryView)

export const PopoverStory = compose(
  Effect.fnUntraced(function* () {
    return {
      popover: yield* View.child(Popover, {
        label: "Sharing",
        text: "Share",
        content: TextView({
          text: "Anyone with the link can view this project. Members can also edit it and invite others.",
        }),
      }),
    }
  }),
)(PopoverStoryView)

export const ComboboxStory = compose(
  Effect.fnUntraced(function* () {
    const fruit = yield* UiState.make("fruit", Schema.String, "")

    return {
      picked: fruit,
      combobox: yield* View.child(Combobox, {
        label: "Fruit",
        name: "fruit",
        choices: [
          { value: "apple", label: "Apple" },
          { value: "banana", label: "Banana" },
          { value: "mango", label: "Mango" },
          { value: "orange", label: "Orange" },
        ],
        value: fruit,
        onChange: (value) => UiState.set(fruit, value),
      }),
    }
  }),
)(ComboboxStoryView)

export const ListboxStory = compose(
  Effect.fnUntraced(function* () {
    const size = yield* UiState.make("size", Schema.String, "m")

    return {
      chosen: size,
      listbox: yield* View.child(Listbox, {
        label: "Size",
        name: "size",
        choices: [
          { value: "s", label: "Small" },
          { value: "m", label: "Medium" },
          { value: "l", label: "Large" },
        ],
        value: size,
        onChange: (value) => UiState.set(size, value),
      }),
    }
  }),
)(ListboxStoryView)
