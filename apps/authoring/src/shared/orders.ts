import { Context, Effect, Schema } from "effect"
import { Model, Query, Store } from "spar"

export const Order = Schema.Struct({ id: Schema.String, total: Schema.Finite })

export class Shop extends Context.Service<
  Shop,
  { readonly ordersOf: (userId: string) => Effect.Effect<ReadonlyArray<typeof Order.Type>> }
>()("Shop") {}

export class OrdersQuery extends Query.Tag<OrdersQuery>()("Orders", {
  input: Schema.String,
  success: Schema.Array(Order),
  failure: Schema.Never,
  load: (userId: string) => Effect.flatMap(Effect.service(Shop), (shop) => shop.ordersOf(userId)),
}) {}

type Session = { readonly userId: string }

export class SessionStore extends Model.Tag<SessionStore>()("Session", {
  state: Schema.Struct({ userId: Schema.String }),
  initialState: { userId: "ada" },
  actions: {
    signedIn: Store.action(Schema.String, (_state: Session, userId: string): Session => ({
      userId,
    })),
  },
  selectors: {
    userId: Store.selector(Schema.String, (state: Session) => state.userId),
  },
}) {}
