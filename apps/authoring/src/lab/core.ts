import type { Effect, Scope } from "effect"
import type { Element, Handle, View } from "spar"

export type InView = typeof Handle.make extends Effect.Effect<unknown, unknown, infer R> ? R : never

export type Outside<R> = Exclude<R, Scope.Scope | InView>

export type Step<in In, out Add, out E = never, out R = never> = {
  readonly run: (props: In) => Effect.Effect<Add, E, R | Scope.Scope>
}

export type Finish<Outer, Props, E, R> = (
  view: (props: Props) => Element,
) => View.Component<Outer, E, R>

export type Compose = {
  <O, A, EA, RA>(a: Step<O, A, EA, RA>): Finish<O, O & A, EA, RA>
  <O, A, EA, RA, B, EB, RB>(
    a: Step<O, A, EA, RA>,
    b: Step<O & A, B, EB, RB>,
  ): Finish<O, O & A & B, EA | EB, RA | RB>
  <O, A, EA, RA, B, EB, RB, C, EC, RC>(
    a: Step<O, A, EA, RA>,
    b: Step<O & A, B, EB, RB>,
    c: Step<O & A & B, C, EC, RC>,
  ): Finish<O, O & A & B & C, EA | EB | EC, RA | RB | RC>
  <O, A, EA, RA, B, EB, RB, C, EC, RC, D, ED, RD>(
    a: Step<O, A, EA, RA>,
    b: Step<O & A, B, EB, RB>,
    c: Step<O & A & B, C, EC, RC>,
    d: Step<O & A & B & C, D, ED, RD>,
  ): Finish<O, O & A & B & C & D, EA | EB | EC | ED, RA | RB | RC | RD>
  <O, A, EA, RA, B, EB, RB, C, EC, RC, D, ED, RD, F, EF, RF>(
    a: Step<O, A, EA, RA>,
    b: Step<O & A, B, EB, RB>,
    c: Step<O & A & B, C, EC, RC>,
    d: Step<O & A & B & C, D, ED, RD>,
    f: Step<O & A & B & C & D, F, EF, RF>,
  ): Finish<O, O & A & B & C & D & F, EA | EB | EC | ED | EF, RA | RB | RC | RD | RF>
  <O, A, EA, RA, B, EB, RB, C, EC, RC, D, ED, RD, F, EF, RF, G, EG, RG>(
    a: Step<O, A, EA, RA>,
    b: Step<O & A, B, EB, RB>,
    c: Step<O & A & B, C, EC, RC>,
    d: Step<O & A & B & C, D, ED, RD>,
    f: Step<O & A & B & C & D, F, EF, RF>,
    g: Step<O & A & B & C & D & F, G, EG, RG>,
  ): Finish<O, O & A & B & C & D & F & G, EA | EB | EC | ED | EF | EG, RA | RB | RC | RD | RF | RG>
}

export type All = {
  <O, A, EA, RA, B, EB, RB>(
    a: Step<O, A, EA, RA>,
    b: Step<O & A, B, EB, RB>,
  ): Step<O, A & B, EA | EB, RA | RB>
  <O, A, EA, RA, B, EB, RB, C, EC, RC>(
    a: Step<O, A, EA, RA>,
    b: Step<O & A, B, EB, RB>,
    c: Step<O & A & B, C, EC, RC>,
  ): Step<O, A & B & C, EA | EB | EC, RA | RB | RC>
}
