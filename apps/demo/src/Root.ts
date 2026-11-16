import { Effect, Layer } from "effect"
import { SecureRandom } from "effect/crypto"
import { Outbox, View } from "spar"
import { AppView } from "./AppView.tsx"
import { Counter } from "./counter/Counter.ts"
import { CounterStore } from "./counter/CounterStore.ts"
import { MailApi } from "./mail/MailApi.ts"
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
    }
  }),
)(AppView)

export const layer = Layer.mergeAll(CounterStore.layer(), TodoStore.layer(), MailStoreLive).pipe(
  Layer.provideMerge(Layer.mergeAll(MailApi.layer, Outbox.Outbox.layer)),
  Layer.provide(SecureRandom.layerWebCrypto),
)
