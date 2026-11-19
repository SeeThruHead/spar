import { Schema } from "effect"
import { Props, View } from "spar"

export const PersonRowView = View.make(
  "PersonRowView",
  {
    id: Schema.String,
    name: Props.Reactive(Schema.String),
    email: Props.Reactive(Schema.String),
    selected: Props.Reactive(Schema.Boolean),
    onToggle: Props.Action,
  },
  (props) => (
    <tr data-selected={props.selected}>
      <td>
        <input
          type="checkbox"
          id={`person-${props.id}`}
          checked={props.selected}
          onChange={props.onToggle}
        />
      </td>
      <td>
        <label for={`person-${props.id}`}>{props.name}</label>
      </td>
      <td>{props.email}</td>
    </tr>
  ),
)

export const PeopleView = View.make(
  "PeopleView",
  {
    status: Props.Reactive(Schema.String),
    rows: Props.Element,
    count: Props.Reactive(Schema.String),
    csv: Props.Reactive(Schema.String),
    download: Props.Reactive(Schema.String),
    refused: Props.Reactive(Schema.String),
    onExport: Props.Action,
    onRefresh: Props.Action,
  },
  (props) => (
    <section class="people" aria-label="People">
      <h2>People</h2>
      <p>
        <output aria-label="People status">{props.status}</output>,{" "}
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
        <tbody>{props.rows}</tbody>
      </table>
      <p>
        <button type="button" class="spar-button" onClick={props.onExport}>
          Export CSV
        </button>{" "}
        <button type="button" class="spar-button spar-quiet" onClick={props.onRefresh}>
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
  ),
)
