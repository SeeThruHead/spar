import { Effect, Schema } from "effect"
import { Model, Query, Store } from "spar"
import { ServerUnreachable, User } from "./api.ts"
import { Server } from "./server/Server.ts"

export class UsersQuery extends Query.Tag<UsersQuery>()("sidebar/Users", {
  input: Schema.Void,
  success: Schema.Array(User),
  failure: ServerUnreachable,
  load: () => Effect.flatMap(Effect.service(Server), (server) => server.users),
  staleAfter: "30 seconds",
}) {}

const State = Schema.Struct({
  selected: Schema.Array(Schema.Int),
  csv: Schema.NullOr(Schema.String),
  problem: Schema.String,
})

type State = typeof State.Type

const initialState: State = { selected: [], csv: null, problem: "" }

const toggled = (selected: ReadonlyArray<number>, id: number): ReadonlyArray<number> =>
  selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id]

export class PeopleStore extends Model.Tag<PeopleStore>()("sidebar/People", {
  state: State,
  initialState,
  actions: {
    toggled: Store.action(Schema.Int, (state: State, id: number): State => ({
      ...state,
      selected: toggled(state.selected, id),
    })),
    nothingToExport: Store.action(Schema.Void, (state: State): State => ({
      ...state,
      problem: "Select at least one person first",
    })),
    exported: Store.action(Schema.String, (state: State, csv: string): State => ({
      ...state,
      csv,
      problem: "",
    })),
  },
  selectors: {
    selected: Store.selector(Schema.Array(Schema.Int), (state: State) => state.selected),
    problem: Store.selector(Schema.String, (state: State) => state.problem),
    csv: Store.selector(Schema.String, (state: State) => state.csv ?? ""),
    download: Store.selector(Schema.String, (state: State) =>
      state.csv === null ? "" : `data:text/csv;charset=utf-8,${encodeURIComponent(state.csv)}`,
    ),
  },
}) {}

export const csvOf = (users: ReadonlyArray<User>, selected: ReadonlyArray<number>): string =>
  ["name,email", ...users.filter((user) => selected.includes(user.id)).map(lineOf)].join("\n")

const lineOf = (user: User): string => `${user.name},${user.email}`

export const exportCsv = Effect.fn("People.exportCsv")(function* () {
  const people = yield* PeopleStore
  const selected = yield* people.select.selected.get

  if (selected.length === 0) return yield* people.commands.nothingToExport()

  const loaded = yield* UsersQuery.read()

  yield* people.commands.exported(csvOf(loaded ?? [], selected))
})
