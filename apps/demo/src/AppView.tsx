import type { Element } from "spar"

type Props = {
  readonly counter: Element
  readonly todos: Element
  readonly mail: Element
  readonly tools: Element
}

export const AppView = ({ counter, todos, mail, tools }: Props) => (
  <main>
    <h1>Spar demo</h1>
    {counter}
    {todos}
    {mail}
    {tools}
  </main>
)
