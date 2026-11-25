import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Props, Reactive } from "spar"
import { OrdersQuery, SessionStore } from "../shared/orders.ts"
import * as View from "./View.ts"

export const Orders = View.compose(
  View.props({ userId: Props.Reactive(Schema.String) }),
  View.bind("orders", ({ userId }) => OrdersQuery.ask(userId)),
)(({ orders }) => (
  <p aria-busy={Reactive.map(orders.result, (result) => result.waiting)}>
    {Reactive.map(orders.result, (result) => AsyncResult.getOrElse(result, () => []).length)} orders
  </p>
))

export const Account = View.compose(
  View.service("session", SessionStore),
  View.bind("orders", ({ session }) => View.child(Orders, { userId: session.select.userId })),
)(({ session, orders }) => (
  <section>
    <h2>{session.select.userId}</h2>
    {orders}
  </section>
))
