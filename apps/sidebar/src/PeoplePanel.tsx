import { Option } from "effect"
import { For, Reactive, compose, withHandlers, withQuery, withStore } from "spar"
import type { Query, Store } from "spar"
import { PeopleStore, UsersQuery, exportsCsv } from "./People.ts"

const statusOf = (status: Query.Status): string =>
  ({
    waiting: "Waiting",
    loading: "Loading",
    loaded: "Loaded",
    failed: "Could not load",
  })[status]

const told = (refused: Option.Option<Store.Refusal>): string =>
  Option.match(refused, { onNone: () => "", onSome: (refusal) => refusal.reason })

const PeoplePanel = compose(
  withQuery("users", UsersQuery, () => undefined),
  withHandlers((props) => ({
    rows: Reactive.map(props.users.value, (loaded) => loaded ?? []),
  })),
  withStore(PeopleStore, (people) => ({
    selected: people.select.selected,
    count: Reactive.map(people.select.selected, (selected) => `${selected.length} selected`),
    csv: people.select.csv,
    download: people.select.download,
    refused: Reactive.map(people.refused, told),
    onToggle: (id: number) => people.commands.toggled(id),
    onExport: people.commands.exportRequested(),
  })),
)((props) => (
  <section class="people" aria-label="People">
    <h2>People</h2>
    <p>
      <output aria-label="People status">{Reactive.map(props.users.status, statusOf)}</output>,{" "}
      <output aria-label="People selected">{props.count}</output>
    </p>
    <table>
      <thead>
        <tr>
          <th scope="col">Pick</th>
          <th scope="col">Name</th>
          <th scope="col">Email</th>
        </tr>
      </thead>
      <tbody>
        <For each={props.rows} by={(user) => String(user.id)}>
          {(user, id) => (
            <tr data-selected={Reactive.map(props.selected, (all) => all.includes(Number(id)))}>
              <td>
                <input
                  type="checkbox"
                  id={`person-${id}`}
                  checked={Reactive.map(props.selected, (all) => all.includes(Number(id)))}
                  onChange={props.onToggle(Number(id))}
                />
              </td>
              <td>
                <label for={`person-${id}`}>{Reactive.map(user, (now) => now.name)}</label>
              </td>
              <td>{Reactive.map(user, (now) => now.email)}</td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
    <p>
      <button type="button" class="spar-button" onClick={props.onExport}>
        Export CSV
      </button>{" "}
      <button type="button" class="spar-button spar-quiet" onClick={props.users.refetch}>
        Load again
      </button>
    </p>
    <p>
      <output aria-label="Export problem">{props.refused}</output>
    </p>
    <output class="csv" aria-label="Exported CSV">
      {props.csv}
    </output>
    <p>
      <a href={props.download} download="people.csv">
        Download people.csv
      </a>
    </p>
  </section>
))

export const People = UsersQuery.beside(PeopleStore.with(PeoplePanel, [exportsCsv]))
