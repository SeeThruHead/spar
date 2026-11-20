import { compose, withHandlers } from "spar"

export const Greeting = compose(withHandlers(() => ({ greeting: "hello" })))
