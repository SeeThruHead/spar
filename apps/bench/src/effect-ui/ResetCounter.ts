import { Command, Component, UiSchema } from "@effect/ui"
import { Html } from "@effect/ui/html"
import { Duration, Effect, Schema } from "effect"

export const CounterModel = Schema.Struct({
  count: Schema.Int,
  resetting: Schema.Boolean,
})

export const CounterMessage = UiSchema.TaggedEnum({
  ClickedAdd: {},
  ClickedReset: {},
  CompletedReset: {},
})

export class ResetAfterDelay extends Command.Service<ResetAfterDelay>()("counter/ResetAfterDelay", {
  args: {},
  success: CounterMessage,
  mode: "switch",
}) {
  static readonly layer = this.toLayer(() =>
    Effect.as(Effect.sleep(Duration.seconds(2)), CounterMessage.CompletedReset()),
  )
}

const CounterWithoutLayer = Html.component({
  name: "ResetCounter",
  model: CounterModel,
  message: CounterMessage,
}).make({
  init: () => ({ count: 0, resetting: false }),
  update: {
    ClickedAdd: ($) => ($.model.resetting ? $.model : $.evolve({ count: (count) => count + 1 })),
    ClickedReset: ($) =>
      $.model.resetting ? $.model : $.evolve({ resetting: true }).run(ResetAfterDelay.make({})),
    CompletedReset: ($) => $.evolve({ count: 0, resetting: false }),
  },
  view: (h, model) =>
    h.section.attr("aria-label", "Counter").children(
      h.output.attr("aria-label", "Count").children(String(model.count)),
      h.button.on("click", CounterMessage.ClickedAdd()).children("Add 1"),
      h.button
        .on("click", CounterMessage.ClickedReset())
        .attr("disabled", h.isRunning(ResetAfterDelay) ? "" : undefined)
        .children("Reset after a delay"),
    ),
})

export const ResetCounter = CounterWithoutLayer.pipe(Component.provide(ResetAfterDelay.layer))
