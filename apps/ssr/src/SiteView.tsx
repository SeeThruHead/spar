import { Schema } from "effect"
import { Props, Router, View } from "spar"

export const ProductView = View.make(
  "ProductView",
  {
    name: Props.Reactive(Schema.String),
    status: Props.Reactive(Schema.String),
    supplier: Props.Reactive(Schema.String),
    supplierStatus: Props.Reactive(Schema.String),
    back: Router.Link,
  },
  (props) => (
    <main>
      <h1>
        <output aria-label="Product">{props.name}</output>
      </h1>
      <p>
        Product <output aria-label="Product status">{props.status}</output>
      </p>
      <p>
        Supplied by <output aria-label="Supplier">{props.supplier}</output>{" "}
        <output aria-label="Supplier status">{props.supplierStatus}</output>
      </p>
      <a href={props.back.href} onClick={props.back.onClick}>
        Back to the shop
      </a>
    </main>
  ),
)

export const MissingView = View.make("MissingView", { path: Schema.String }, ({ path }) => (
  <main>
    <h1>Nothing at {path}</h1>
  </main>
))

export const SiteView = View.make(
  "SiteView",
  { cheese: Router.Link, bread: Router.Link, page: Props.Element },
  (props) => (
    <div>
      <nav aria-label="Products">
        <a href={props.cheese.href} onClick={props.cheese.onClick}>
          About the cheese
        </a>{" "}
        <a href={props.bread.href} onClick={props.bread.onClick}>
          About the bread
        </a>
      </nav>
      {props.page}
    </div>
  ),
)
