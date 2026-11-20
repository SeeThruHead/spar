import { Effect, Schema } from "effect"
import { compose, withProps } from "spar"

class Missing extends Schema.TaggedError<Missing, { readonly brand: unique symbol }>()(
  "Missing",
  {},
) {}

const withLookup = () => Effect.fail(new Missing())

export const Profile = compose(withProps({ id: Schema.String }), withLookup)(() => <p>profile</p>)

export const Page = compose(withProps({}))(() => (
  <main>
    <Profile id="ada" />
  </main>
))
