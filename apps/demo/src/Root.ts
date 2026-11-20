import { Effect, Layer } from "effect"
import { SecureRandom } from "effect/crypto"
import { Outbox, Tabs, View } from "spar"
import * as Devtools from "spar/devtools"
import { AppView } from "./AppView.tsx"
import { Counter } from "./counter/Counter.tsx"
import { CounterStore } from "./counter/CounterStore.ts"
import { MailApi } from "./server/MailApi.ts"
import { MailStoreLive } from "./mail/MailStore.ts"
import { Mail } from "./mail/Thread.ts"
import { Todos } from "./todos/Todos.ts"
import { TodoStore } from "./todos/TodoStore.ts"

export const Root = View.connect(
  Effect.fnUntraced(function* () {
    return {
      counter: yield* View.child(Counter, {}),
      todos: yield* View.child(Todos, {}),
      mail: yield* View.child(Mail, {}),
      tools: yield* View.child(Devtools.Panel, {}),
    }
  }),
)(AppView)

export const layer = Layer.mergeAll(
  CounterStore.layer(),
  TodoStore.layerDurable(),
  MailStoreLive,
).pipe(
  Layer.provideMerge(Layer.mergeAll(MailApi.layer, Outbox.Outbox.layer, Devtools.layer)),
  Layer.provide(Outbox.layerBrowser),
  Layer.provide(Tabs.layerBrowser),
  Layer.provide(SecureRandom.layerWebCrypto),
)
