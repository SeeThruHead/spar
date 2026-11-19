import { Context, Effect, Schema } from "effect"

export const Piece = Schema.Struct({ stores: Schema.Record(Schema.String, Schema.Json) })

export type Piece = typeof Piece.Type

export const holder = "__sparPieces"

const Text = Schema.fromJsonString(Piece)

export const script = (piece: Piece): string =>
  `<script>(self.${holder}=self.${holder}||[]).push(${Schema.encodeSync(Text)(piece).replaceAll("<", "\\u003c")})</script>`

export type Adopt = (state: Schema.Json) => Effect.Effect<void>

export const Adopters = Context.Reference<{
  readonly register: (key: string, adopt: Adopt) => Effect.Effect<void>
}>("spar/Pieces/Adopters", { defaultValue: () => ({ register: () => Effect.void }) })
