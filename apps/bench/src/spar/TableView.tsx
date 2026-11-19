import { Schema } from "effect"
import { Props, Reactive, View } from "spar"
import { Row } from "./TableStore.ts"

export const RowView = View.make(
  "RowView",
  {
    id: Schema.String,
    row: Props.Reactive(Row),
    selected: Props.Reactive(Schema.Boolean),
    onSelect: Props.Action,
    onRemove: Props.Action,
  },
  ({ id, row, selected, onSelect, onRemove }) => (
    <tr class={{ danger: selected }}>
      <td class="col-md-1">{id}</td>
      <td class="col-md-4">
        <a class="lbl" onClick={onSelect}>
          {Reactive.map(row, (current) => current.label)}
        </a>
      </td>
      <td class="col-md-1">
        <a class="remove" onClick={onRemove}>
          x
        </a>
      </td>
      <td class="col-md-6" />
    </tr>
  ),
)

export const TableView = View.make(
  "TableView",
  {
    rows: Props.Element,
    onRun: Props.Action,
    onRunLots: Props.Action,
    onAdd: Props.Action,
    onUpdate: Props.Action,
    onUpdateOne: Props.Action,
    onClear: Props.Action,
    onSwap: Props.Action,
  },
  (props) => (
    <div id="main">
      <div class="jumbotron">
        <h1>Spar</h1>
        <button id="run" onClick={props.onRun}>
          Create 1,000 rows
        </button>
        <button id="runlots" onClick={props.onRunLots}>
          Create 10,000 rows
        </button>
        <button id="add" onClick={props.onAdd}>
          Append 1,000 rows
        </button>
        <button id="update" onClick={props.onUpdate}>
          Update every 10th row
        </button>
        <button id="updateone" onClick={props.onUpdateOne}>
          Update one row
        </button>
        <button id="clear" onClick={props.onClear}>
          Clear
        </button>
        <button id="swaprows" onClick={props.onSwap}>
          Swap rows
        </button>
      </div>
      <table>
        <tbody id="tbody">{props.rows}</tbody>
      </table>
    </div>
  ),
)
