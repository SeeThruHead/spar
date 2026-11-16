import { Reactive } from "spar"
import type { Action, Element } from "spar"
import type { Row } from "../shared/rows.ts"

type RowProps = {
  readonly id: string
  readonly row: Reactive.Reactive<Row>
  readonly selected: Reactive.Reactive<boolean>
  readonly onSelect: Action
  readonly onRemove: Action
}

export const RowView = ({ id, row, selected, onSelect, onRemove }: RowProps) => (
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
)

type TableProps = {
  readonly rows: Element
  readonly onRun: Action
  readonly onRunLots: Action
  readonly onAdd: Action
  readonly onUpdate: Action
  readonly onClear: Action
  readonly onSwap: Action
}

export const TableView = (props: TableProps) => (
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
)
