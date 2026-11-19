import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

export const Product = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  supplierId: Schema.String,
})

export type Product = typeof Product.Type

export const Supplier = Schema.Struct({ id: Schema.String, name: Schema.String })

export type Supplier = typeof Supplier.Type

export class NotKnown extends Schema.TaggedError<NotKnown, { readonly brand: unique symbol }>()(
  "NotKnown",
  { what: Schema.String },
) {}

export class Shelf extends RpcGroup.make(
  Rpc.make("Product", { payload: { id: Schema.String }, success: Product, error: NotKnown }),
  Rpc.make("Supplier", { payload: { id: Schema.String }, success: Supplier, error: NotKnown }),
) {}
