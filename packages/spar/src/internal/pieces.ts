import { Context, Effect, Option, Schema } from "effect"
import { succeed } from "./reactive.ts"
import type { Reactive } from "./reactive.ts"

export const Piece = Schema.Struct({
  stores: Schema.Record(Schema.String, Schema.Json),
  done: Schema.optional(Schema.Boolean),
})

export type Piece = typeof Piece.Type

export const holder = "__sparPieces"

const Text = Schema.fromJsonString(Piece)

export const script = (piece: Piece): string =>
  `<script>(self.${holder}=self.${holder}||[]).push(${Schema.encodeSync(Text)(piece).replaceAll("<", "\\u003c")})</script>`

export const taken = "data-spar-taken"

const unclosed = (html: string): string => html.replaceAll("</template", "<\\/template")

const Selector = Schema.fromJsonString(Schema.String)

const Position = Schema.fromJsonString(Schema.Int)

const quoted = (root: string): string =>
  Schema.encodeSync(Selector)(root).replaceAll("<", "\\u003c")

export const html = (root: string, drawn: string): string =>
  `<template data-spar-piece>${unclosed(drawn)}</template><script>(function(t){var r=document.querySelector(${quoted(root)});if(r&&!r.hasAttribute("${taken}"))r.replaceChildren(t.content)})(document.currentScript.previousElementSibling)</script>`

export const part = (root: string, open: number, close: number, drawn: string): string =>
  `<template data-spar-piece>${unclosed(drawn)}</template><script>(function(t){var r=document.querySelector(${quoted(root)});if(!r||r.hasAttribute("${taken}"))return;var e=function(n,d){return Array.from(n.childNodes).flatMap(function(c){return c.nodeType===8?(c.data===d?[c]:[]):e(c,d)})};var a=e(r,"spar(")[${Schema.encodeSync(Position)(open)}],b=e(r,"spar)")[${Schema.encodeSync(Position)(close)}];if(!a||!b)return;var g=document.createRange();g.setStartAfter(a);g.setEndBefore(b);g.deleteContents();g.insertNode(t.content)})(document.currentScript.previousElementSibling)</script>`

const decodePiece = Schema.decodeUnknownOption(Piece)

export const arrivedEarly = (waiting: unknown): ReadonlyArray<Piece> =>
  (Array.isArray(waiting) ? waiting : []).flatMap((piece) => Option.toArray(decodePiece(piece)))

export const seededWith = (
  stores: Readonly<Record<string, Schema.Json>>,
  early: ReadonlyArray<Piece>,
): Readonly<Record<string, Schema.Json>> =>
  early.reduce((seed, piece) => ({ ...seed, ...piece.stores }), stores)

export type Adopt = (state: Schema.Json) => Effect.Effect<void>

export const Adopters = Context.Reference<{
  readonly register: (key: string, adopt: Adopt) => Effect.Effect<void>
}>("spar/Pieces/Adopters", { defaultValue: () => ({ register: () => Effect.void }) })

export const Expected = Context.Reference<Reactive<boolean>>("spar/Pieces/Expected", {
  defaultValue: () => succeed(false),
})
