import { Context, Effect, Fiber, Layer, Option, Record, Schema, Semaphore, Struct } from "effect"
import type { Scope } from "effect"
import * as Cell from "./cell.ts"
import { UnknownAction } from "./journal.ts"
import type { Action, Actions, Entry, Mode, Selector, Selectors, Task, Tasks } from "./journal.ts"
import { sourced } from "./inspect.ts"
import { fromCell, map, zip } from "./reactive.ts"
import type { Reactive } from "./reactive.ts"
import { Seed } from "./server.ts"
import { UiTree } from "./uiTree.ts"
import * as State from "../State.ts"
import * as Timeline from "../Timeline.ts"
import type { Mountable } from "../View.ts"
import { within } from "./viewParts.ts"
import { replacingWholeState } from "./written.ts"

type PayloadOf<A> = A extends {
  readonly decode: (payload: Schema.Json) => Effect.Effect<infer Payload, Schema.SchemaError>
}
  ? Payload
  : never

export interface ToReactive<State> extends Struct.Lambda {
  (selector: Selector<State, unknown>): Reactive<unknown>
  readonly "~lambda.out": this["~lambda.in"] extends Selector<never, infer A> ? Reactive<A> : never
}

export type Inspected = {
  readonly key: string
  readonly base: number
  readonly encoded: Effect.Effect<Schema.Json>
  readonly state: Reactive<unknown>
  readonly stateAt: (seq: number) => Effect.Effect<unknown>
  readonly log: Reactive<ReadonlyArray<Entry>>
  readonly viewing: Reactive<number | null>
  readonly travelTo: (seq: number | null) => Effect.Effect<void>
  readonly actions: () => ReadonlyArray<{ readonly name: string; readonly schema: Schema.Top }>
  readonly hold: Effect.Effect<Effect.Effect<void>>
  readonly forkAt: (seq: number) => Effect.Effect<void>
  readonly load: (
    entries: ReadonlyArray<Entry>,
  ) => Effect.Effect<void, Schema.SchemaError | UnknownAction>
  readonly run: (
    action: string,
    payload: Schema.Json,
  ) => Effect.Effect<void, Schema.SchemaError | UnknownAction>
}

export const Inspector = Context.Reference<{
  readonly keepStates: number
  readonly register: (store: Inspected) => Effect.Effect<void>
  readonly forget?: (key: string) => Effect.Effect<void>
}>("spar/Store/Inspector", {
  defaultValue: () => ({ keepStates: 0, register: () => Effect.void }),
})

export type SPAR_REDUCER_STATE_UNTYPED = {
  readonly fix: "give the reducer its state type, as in (state: State, payload) => ..."
}

type Typed<State, Made> = unknown extends State ? SPAR_REDUCER_STATE_UNTYPED : Made

export function action<Payload, Encoded, State>(
  schema: Schema.Codec<Payload, Encoded>,
  reduce: (state: State, payload: Payload) => State,
): Typed<State, Action<State, Payload>>
export function action<Payload, Encoded, State>(
  schema: Schema.Codec<Payload, Encoded>,
  reduce: (state: State, payload: Payload) => State,
): Action<State, Payload> | SPAR_REDUCER_STATE_UNTYPED {
  const json = Schema.toCodecJson(schema)
  const decode = Schema.decodeUnknownEffect(json)

  return {
    encode: Schema.encodeUnknownEffect(json),
    schema: json,
    decode,
    reducer: (payload) =>
      Effect.map(decode(payload), (decoded) => (state: State) => reduce(state, decoded)),
  }
}

type TaskOptions<Payload, Result, ResultEncoded, State, Refuses extends string, Needs> = {
  readonly result: Schema.Codec<Result, ResultEncoded>
  readonly run: (payload: Payload, state: State) => Effect.Effect<Result, never, Needs>
  readonly finish: (state: State, result: Result) => State
  readonly mode: Mode
  readonly refuses?: ReadonlyArray<Refuses>
}

export function task<
  Payload,
  Encoded,
  Result,
  ResultEncoded,
  State,
  const Refuses extends string = never,
  Needs = never,
>(
  schema: Schema.Codec<Payload, Encoded>,
  options: TaskOptions<Payload, Result, ResultEncoded, State, Refuses, Needs>,
): Typed<State, Task<State, Payload, Refuses, Needs>>
export function task<
  Payload,
  Encoded,
  Result,
  ResultEncoded,
  State,
  const Refuses extends string = never,
  Needs = never,
>(
  schema: Schema.Codec<Payload, Encoded>,
  options: TaskOptions<Payload, Result, ResultEncoded, State, Refuses, Needs>,
): Task<State, Payload, Refuses, Needs> | SPAR_REDUCER_STATE_UNTYPED {
  const json = Schema.toCodecJson(schema)
  const decode = Schema.decodeUnknownEffect(json)
  const results = Schema.toCodecJson(options.result)
  const encodeResult = Schema.encodeEffect(results)
  const decodeResult = Schema.decodeUnknownEffect(results)

  return {
    encode: Schema.encodeUnknownEffect(json),
    decode,
    work: (payload, state) =>
      Effect.orDie(
        Effect.flatMap(
          Effect.flatMap(decode(payload), (decoded) => options.run(decoded, state)),
          encodeResult,
        ),
      ),
    finished: (result) =>
      Effect.map(
        decodeResult(result),
        (decoded) => (state: State) => options.finish(state, decoded),
      ),
    mode: options.mode,
    refuses: options.refuses ?? [],
  }
}

export const selector = <A, State>(
  schema: Schema.Codec<A, unknown>,
  select: (state: State) => NoInfer<A>,
): Selector<State, A> => ({ schema, select })

type NoTasks = Readonly<Record<string, never>>

type Refusable<A, T> = {
  readonly [Name in keyof T]: T[Name] & {
    readonly refuses: ReadonlyArray<(keyof A | keyof T) & string>
  }
}

export type Definition<
  State,
  A extends Actions<State>,
  S extends Selectors<State>,
  T extends Tasks<State, Needs> = NoTasks,
  Needs = never,
> = {
  readonly state: Schema.Codec<State, unknown>
  readonly initialState: State
  readonly actions: A
  readonly selectors: S
  readonly tasks?: T & Refusable<A, T> & Tasks<State, Needs>
}

export type Shape<
  State,
  A extends Actions<State>,
  S extends Selectors<State>,
  T extends Tasks<State, unknown> = NoTasks,
> = {
  readonly state: Reactive<State>
  readonly select: { readonly [Name in keyof S]: Struct.Apply<ToReactive<State>, S[Name]> }
  readonly commands: {
    readonly [Name in keyof A & string]: (payload: PayloadOf<A[Name]>) => Effect.Effect<void>
  }
  readonly tasks: {
    readonly [Name in keyof T & string]: (payload: PayloadOf<T[Name]>) => Effect.Effect<void>
  }
  readonly running: { readonly [Name in keyof T & string]: Reactive<boolean> }
}

type Borrowed<State> = {
  readonly entries: ReadonlyArray<Entry>
  readonly steps: ReadonlyArray<{ readonly seq: number; readonly state: State }>
}

const stateAt = <State>(past: Borrowed<State>, initial: State, seq: number): State =>
  past.steps.filter((step) => step.seq <= seq).at(-1)?.state ?? initial

const seededFrom = <State>(
  seed: Readonly<Record<string, Schema.Json>>,
  key: string,
  schema: Schema.Codec<State, unknown>,
  otherwise: State,
): State =>
  Option.getOrElse(
    Option.flatMap(Record.get(seed, key), Schema.decodeUnknownOption(Schema.toCodecJson(schema))),
    () => otherwise,
  )

const finishedName = (name: string): string => `${name} finished`

const moved = (count: Cell.Cell<number>, by: 1 | -1): Effect.Effect<void> =>
  Effect.sync(() => count.write(count.read() + by))

const tasksOf = <T extends object>(given: T | undefined): T => given ?? Object.create(null)

type Starter = (work: Effect.Effect<void>) => Effect.Effect<void>

const forked = (scope: Scope.Scope, work: Effect.Effect<void>) =>
  Effect.forkIn(work, scope, { startImmediately: true })

const switched = (scope: Scope.Scope): Starter => {
  const current = Cell.make<Option.Option<Fiber.Fiber<void>>>(Option.none())

  return (work) =>
    Effect.flatMap(forked(scope, work), (fiber) => {
      const previous = current.read()
      current.write(Option.some(fiber))

      return Effect.forEach(Option.toArray(previous), Fiber.interrupt, { discard: true })
    })
}

const queued = (scope: Scope.Scope): Starter => {
  const turn = Semaphore.makeUnsafe(1)

  return (work) => Effect.asVoid(forked(scope, Semaphore.withPermit(turn, work)))
}

const runnerFor = (mode: Mode, scope: Scope.Scope): Starter => {
  if (mode === "switch") return switched(scope)
  if (mode === "queue") return queued(scope)

  return (work) => Effect.asVoid(forked(scope, work))
}

export const made = Effect.fnUntraced(function* <
  State,
  A extends Actions<State>,
  S extends Selectors<State>,
  E,
  R,
  T extends Tasks<State, Needs> = NoTasks,
  Needs = never,
>(
  key: string,
  definition: Definition<State, A, S, T, Needs>,
  start: Effect.Effect<State, E, R>,
): Effect.fn.Return<Shape<State, A, S, T>, E, R | Needs | Scope.Scope> {
  const needed = yield* Effect.context<Needs>()
  const state = yield* State.current
  const seed = yield* Seed
  const started = yield* start
  const slot = yield* state.slot(
    [key],
    definition.state,
    seededFrom(seed, key, definition.state, started),
  )
  const recorder = yield* Timeline.Recorder
  const named: Readonly<Record<keyof A & string, Action<State, unknown>>> = definition.actions
  const viewing = Cell.make<number | null>(null)
  const borrowed = Cell.make<Option.Option<Borrowed<State>>>(Option.none())
  const shownAt = (seq: number) =>
    Option.match(borrowed.read(), {
      onNone: () => slot.showAt(seq),
      onSome: (past) => slot.show(stateAt(past, definition.initialState, seq)),
    })
  const backToLive = Effect.suspend(() => {
    borrowed.write(Option.none())
    viewing.write(null)

    return slot.showAt(null)
  })
  const shownFrom = (seq: number) =>
    Effect.suspend(() => {
      viewing.write(seq)

      return shownAt(seq)
    })
  const applied = (name: string, reduce: (now: State) => State, payload: Schema.Json) =>
    Effect.andThen(
      slot.update(name, reduce, payload),
      Effect.andThen(
        Effect.suspend(() =>
          Effect.forEach(Option.toArray(Option.fromNullishOr(viewing.read())), shownAt, {
            discard: true,
          }),
        ),
        Effect.provideService(
          Timeline.note("command", `${key}/${name}`, () => payload),
          Timeline.Recorder,
          recorder,
        ),
      ),
    )
  const run = (name: string, handled: Action<State, unknown>, payload: Schema.Json) =>
    Effect.flatMap(Effect.orDie(handled.reducer(payload)), (reduce) =>
      applied(name, reduce, payload),
    )
  const jobs: Readonly<Record<keyof T & string, Task<State, unknown, string, Needs>>> = tasksOf(
    definition.tasks,
  )
  const scope = yield* Effect.scope
  const held = Record.map(jobs, (job) => ({
    job,
    begin: runnerFor(job.mode, scope),
    count: Cell.make(0),
  }))
  const running = Record.map(held, ({ count }) => map(fromCell(count), (busy) => busy > 0))
  const busyWith = (name: string) =>
    Record.toEntries(held)
      .filter(([, { job, count }]) => job.refuses.includes(name) && count.read() > 0)
      .map(([job]) => job)
  const refusing = (name: string, go: Effect.Effect<void>) =>
    Effect.suspend(() => {
      const busy = busyWith(name)

      return busy.length === 0
        ? go
        : Effect.provideService(
            Timeline.note("refused", `${key}/${name}`, () => ({ while: busy })),
            Timeline.Recorder,
            recorder,
          )
    })
  const traced = (name: string, effect: Effect.Effect<void>) =>
    Effect.withSpan(effect, `${key}/${name}`, {
      captureStackTrace: false,
      attributes: { "spar.store": key, "spar.action": name },
    })
  const commands = Record.map(
    named,
    (handled, name) => (input: unknown) =>
      Effect.suspend(() =>
        traced(
          name,
          refusing(
            name,
            Effect.flatMap(Effect.orDie(handled.encode(input)), (payload) =>
              run(name, handled, payload),
            ),
          ),
        ),
      ),
  )
  const givenNeeds = <Done>(work: Effect.Effect<Done, never, Needs>) =>
    Effect.updateContext(work, (current: Context.Context<never>) => Context.merge(needed, current))
  const worked = (name: string, job: Task<State, unknown, string, Needs>, payload: Schema.Json) =>
    Effect.flatMap(slot.value.get, (now) =>
      Effect.flatMap(givenNeeds(job.work(payload, now)), (result) =>
        Effect.flatMap(Effect.orDie(job.finished(result)), (reduce) =>
          traced(finishedName(name), applied(finishedName(name), reduce, result)),
        ),
      ),
    )
  const tasks = Record.map(
    held,
    ({ job, begin, count }, name) =>
      (input: unknown) =>
        Effect.suspend(() =>
          traced(
            name,
            refusing(
              name,
              Effect.flatMap(Effect.orDie(job.encode(input)), (payload) =>
                Effect.andThen(
                  Effect.andThen(
                    moved(count, 1),
                    applied(name, (now) => now, payload),
                  ),
                  begin(Effect.ensuring(worked(name, job, payload), moved(count, -1))),
                ),
              ),
            ),
          ),
        ),
  )
  const nameOf = new Map(
    Record.toEntries(definition.selectors).map(([name, chosen]) => [chosen, name] as const),
  )
  const select = Struct.map(
    definition.selectors,
    Struct.lambda<ToReactive<State>>((chosen) => {
      const picked = slot.pick(chosen.select)

      sourced(picked, `${key} . ${String(nameOf.get(chosen))}`)

      return picked
    }),
  )
  const inspector = yield* Inspector
  const tree = yield* UiTree

  tree.keepAtLeast(inspector.keepStates)
  const encodeState = Schema.encodeEffect(Schema.toCodecJson(definition.state))
  type Reducing = { readonly reducer: Action<State, unknown>["reducer"] }
  const unchanged: Reducing = { reducer: () => Effect.succeed((now: State) => now) }
  const decodeState = Schema.decodeUnknownEffect(Schema.toCodecJson(definition.state))
  const replaced: Reducing = {
    reducer: (payload) => Effect.map(decodeState(payload), (whole) => () => whole),
  }
  const logged: Readonly<Record<string, Reducing>> = {
    ...Object.fromEntries(replacingWholeState.map((name) => [name, replaced])),
    ...named,
    ...Record.map(jobs, () => unchanged),
    ...Object.fromEntries(
      Record.toEntries(jobs).map(([name, job]) => [finishedName(name), { reducer: job.finished }]),
    ),
  }
  const handlerOf = (name: string) =>
    Effect.mapError(
      Effect.fromNullishOr(Record.get(logged, name).pipe(Option.getOrUndefined)),
      () => new UnknownAction({ action: name }),
    )
  const live = map(state.log, (written) =>
    written
      .filter((entry) => entry.path.length === 0 && entry.slot === slot.name)
      .map((entry) => ({
        id: String(entry.seq),
        action: entry.name,
        payload: entry.payload ?? null,
        seq: entry.seq,
      })),
  )
  const replayed = (entries: ReadonlyArray<Entry>) =>
    Effect.map(
      Effect.forEach(entries, (entry) =>
        Effect.flatMap(handlerOf(entry.action), (handled) =>
          Effect.map(handled.reducer(entry.payload), (reduce) => ({ seq: entry.seq, reduce })),
        ),
      ),
      (reducers): Borrowed<State> => ({
        entries,
        steps: reducers.reduce<Borrowed<State>["steps"]>(
          (steps, { seq, reduce }) => [
            ...steps,
            { seq, state: reduce(steps.at(-1)?.state ?? definition.initialState) },
          ],
          [],
        ),
      }),
    )

  const both = yield* zip(live, fromCell(borrowed))

  yield* Effect.addFinalizer(() => inspector.forget?.(key) ?? Effect.void)
  yield* inspector.register({
    key,
    base: 0,
    encoded: Effect.orDie(Effect.flatMap(slot.value.get, encodeState)),
    state: slot.value,
    stateAt: (seq) =>
      Option.match(borrowed.read(), {
        onNone: () => slot.valueAt(seq),
        onSome: (past) => Effect.succeed(stateAt(past, definition.initialState, seq)),
      }),
    log: map(both, ([entries, past]) =>
      Option.match(past, { onNone: () => entries, onSome: (loaded) => loaded.entries }),
    ),
    viewing: fromCell(viewing),
    travelTo: (seq) => (seq === null ? backToLive : shownFrom(seq)),
    actions: () =>
      Record.toEntries(named).map(([name, handled]) => ({ name, schema: handled.schema })),
    hold: slot.hold,
    forkAt: (seq) =>
      Effect.andThen(
        Effect.sync(() => viewing.write(null)),
        Effect.andThen(slot.showAt(seq), slot.forkAt(seq)),
      ),
    load: (entries) =>
      Effect.flatMap(replayed(entries), (past) =>
        Option.match(Option.fromNullishOr(entries.at(-1)), {
          onNone: () => backToLive,
          onSome: (last) =>
            Effect.andThen(
              Effect.sync(() => borrowed.write(Option.some(past))),
              shownFrom(last.seq),
            ),
        }),
      ),
    run: (name, payload) =>
      Effect.flatMap(handlerOf(name), (handled) =>
        Effect.flatMap(handled.reducer(payload), (reduce) => applied(name, reduce, payload)),
      ),
  })

  return { state: slot.value, select, commands, tasks, running }
})

export const Tag =
  <Self>() =>
  <
    const Key extends string,
    State,
    const A extends Actions<State>,
    const S extends Selectors<State>,
    const T extends Tasks<State, Needs> = NoTasks,
    Needs = never,
  >(
    key: Key,
    definition: Definition<State, A, S, T, Needs>,
  ) => {
    const service = Context.Service<Self, Shape<State, A, S, T>>()(key)

    return class extends service {
      static readonly definition = definition
      static readonly actions = definition.actions
      static readonly layer = Layer.effect(
        service,
        made(key, definition, Effect.succeed(definition.initialState)),
      )
      static readonly layerFrom = <E, R>(load: Effect.Effect<State, E, R>) =>
        Layer.effect(service, made(key, definition, load))
      static readonly layerSaved = Layer.effect(
        service,
        made(key, definition, Effect.succeed(definition.initialState)),
      ).pipe(Layer.provide(State.saved))
      static readonly with = <Props, E = never, R = never, ViewProps = never>(
        self: Mountable<Props, E, R, ViewProps>,
      ) =>
        within(
          (place) =>
            Layer.effect(
              service,
              made(`${key} @ ${place}`, definition, Effect.succeed(definition.initialState)),
            ),
          key,
        )(self)
    }
  }
