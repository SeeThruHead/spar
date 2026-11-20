import { Markup, Props, View } from "spar"

export const ArticleView = View.make(
  "ArticleView",
  { body: Props.Reactive(Markup.Markup) },
  ({ body }) => <article aria-label="Body" markup={body} />,
)
