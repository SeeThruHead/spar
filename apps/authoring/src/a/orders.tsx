import { Schema } from "effect"
import { Props, Reactive } from "spar"
import { OrdersQuery, SessionStore } from "../shared/orders.ts"
import { compose, withChild, withProps, withQuery, withStore } from "./api.ts"

export const Orders = compose(
  withProps({ userId: Props.Reactive(Schema.String) }),
  withQuery("orders", OrdersQuery, (props) => props.userId),
)((props) => (
  <p aria-busy={props.orders.loading}>
    {Reactive.map(props.orders.value, (found) => found?.length ?? 0)} orders
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
