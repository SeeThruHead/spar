import { Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { Props, Reactive } from "spar"
import { OrdersQuery, SessionStore } from "../shared/orders.ts"
import { compose, withChild, withProps, withQuery, withStore } from "./api.ts"

export const Orders = compose(
  withProps({ userId: Props.Reactive(Schema.String) }),
  withQuery("orders", OrdersQuery, (props) => props.userId),
)((props) => (
  <p aria-busy={Reactive.map(props.orders.result, (result) => result.waiting)}>
    {Reactive.map(props.orders.result, (result) => AsyncResult.getOrElse(result, () => []).length)}{" "}
    orders
  </p>
))

export const Account = compose(
  withStore(SessionStore, (session) => ({ userId: session.select.userId })),
  withChild("orders", Orders, (props) => ({ userId: props.userId })),
)((props) => (
  <section>
    <h2>{props.userId}</h2>
    {props.orders}
  </section>
))
