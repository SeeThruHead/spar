import { Effect, Option } from "effect"
import * as Diagnostics from "../Diagnostics.ts"
import * as Timeline from "../Timeline.ts"
import { ViewScope, pathOf } from "./viewScope.ts"

export const noticed = (code: Diagnostics.Code, name: string, said: string): Effect.Effect<void> =>
  Effect.flatMap(Effect.serviceOption(ViewScope), (around) => {
    const where = Option.match(around, {
      onNone: () => ({ in: [], at: "" }),
      onSome: (mounted) => ({ in: pathOf(mounted), at: mounted.at }),
    })

    return Effect.andThen(
      Timeline.note("noticed", name, () => ({
        code,
        said,
        in: where.in.join(" > "),
        at: where.at,
      })),
      Effect.logWarning(Diagnostics.text(code, { said, ...where })),
    )
  })
