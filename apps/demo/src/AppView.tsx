import { Props, View } from "spar"

export const AppView = View.make(
  "AppView",
  { counter: Props.Element, todos: Props.Element, mail: Props.Element, tools: Props.Element },
  ({ counter, todos, mail, tools }) => (
    <main>
      <h1>Spar demo</h1>
      {counter}
      {todos}
      {mail}
      {tools}
    </main>
  ),
)
