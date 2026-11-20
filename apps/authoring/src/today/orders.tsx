import { Effect, Schema } from "effect"
import { Props, Reactive, View } from "spar"
import { OrdersQuery, SessionStore } from "../shared/orders.ts"

const OrdersView = View.make(
  "OrdersView",
  { count: Props.Reactive(Schema.Int), busy: Props.Reactive(Schema.Boolean) },
  ({ count, busy }) => <p aria-busy={busy}>{count} orders</p>,
)

export const Orders = View.taking(
  { userId: Props.Reactive(Schema.String) },
  Effect.fnUntraced(function* ({ userId }) {
    const orders = yield* OrdersQuery.ask(userId)

    return {
      count: Reactive.map(orders.value, (found) => found?.length ?? 0),
      busy: orders.loading,
    }
  }),
)(OrdersView)

const AccountView = View.make(
  "AccountView",
  { userId: Props.Reactive(Schema.String), orders: Props.Element },
  ({ userId, orders }) => (
    <section>
      <h2>{userId}</h2>
      {orders}
    </section>
  ),
)

export const Account = View.connect(
  Effect.fnUntraced(function* () {
    const session = yield* SessionStore

    return {
      userId: session.select.userId,
      orders: yield* View.child(Orders, { userId: session.select.userId }),
    }
  }),
)(AccountView)
