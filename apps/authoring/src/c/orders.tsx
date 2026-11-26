import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Props, Reactive } from "spar"
import { OrdersQuery, SessionStore } from "../shared/orders.ts"
import * as View from "./View.ts"

export const Orders = View.compose(
  View.props({ userId: Props.Reactive(Schema.String) }),
  View.query("orders", OrdersQuery, (props) => props.userId),
)((props) => (
  <p aria-busy={Reactive.map(props.orders.result, (result) => result.waiting)}>
    {Reactive.map(props.orders.result, (result) => AsyncResult.getOrElse(result, () => []).length)}{" "}
    orders
  </p>
))

export const Account = View.compose(
  View.plainStore(SessionStore, (session) => ({ userId: session.select.userId })),
  View.child("orders", Orders, (props) => ({ userId: props.userId })),
)((props) => (
  <section>
    <h2>{props.userId}</h2>
    {props.orders}
  </section>
))
