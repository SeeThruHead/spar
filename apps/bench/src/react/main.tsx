import { memo, useReducer } from "react"
import type { Dispatch } from "react"
import { createRoot } from "react-dom/client"
import {
  exclaimEveryTenth,
  exclaimMiddle,
  makeRows,
  swapSecondAndSecondLast,
} from "../shared/rows.ts"
import type { Row } from "../shared/rows.ts"

type State = {
  readonly rows: ReadonlyArray<Row>
  readonly selected: number
  readonly nextId: number
}

type Action =
  | { readonly type: "created"; readonly count: number }
  | { readonly type: "appended"; readonly count: number }
  | { readonly type: "updated" }
  | { readonly type: "oneUpdated" }
  | { readonly type: "cleared" }
  | { readonly type: "swapped" }
  | { readonly type: "selected"; readonly id: number }
  | { readonly type: "removed"; readonly id: number }

const reduce = (state: State, action: Action): State => {
  if (action.type === "created") {
    return {
      rows: makeRows(action.count, state.nextId),
      selected: 0,
      nextId: state.nextId + action.count,
    }
  }
  if (action.type === "appended") {
    return {
      ...state,
      rows: [...state.rows, ...makeRows(action.count, state.nextId)],
      nextId: state.nextId + action.count,
    }
  }
  if (action.type === "updated") return { ...state, rows: exclaimEveryTenth(state.rows) }
  if (action.type === "oneUpdated") return { ...state, rows: exclaimMiddle(state.rows) }
  if (action.type === "cleared") return { ...state, rows: [], selected: 0 }
  if (action.type === "swapped") return { ...state, rows: swapSecondAndSecondLast(state.rows) }
  if (action.type === "selected") return { ...state, selected: action.id }

  return { ...state, rows: state.rows.filter((row) => row.id !== action.id) }
}

const RowView = memo(
  ({
    row,
    selected,
    dispatch,
  }: {
    readonly row: Row
    readonly selected: boolean
    readonly dispatch: Dispatch<Action>
  }) => (
    <tr className={selected ? "danger" : ""}>
      <td className="col-md-1">{row.id}</td>
      <td className="col-md-4">
        <a className="lbl" onClick={() => dispatch({ type: "selected", id: row.id })}>
          {row.label}
        </a>
      </td>
      <td className="col-md-1">
        <a className="remove" onClick={() => dispatch({ type: "removed", id: row.id })}>
          x
        </a>
      </td>
      <td className="col-md-6" />
    </tr>
  ),
)

const App = () => {
  const [state, dispatch] = useReducer(reduce, { rows: [], selected: 0, nextId: 1 })

  return (
    <div id="main">
      <div className="jumbotron">
        <h1>React</h1>
        <button id="run" onClick={() => dispatch({ type: "created", count: 1000 })}>
          Create 1,000 rows
        </button>
        <button id="runlots" onClick={() => dispatch({ type: "created", count: 10_000 })}>
          Create 10,000 rows
        </button>
        <button id="add" onClick={() => dispatch({ type: "appended", count: 1000 })}>
          Append 1,000 rows
        </button>
        <button id="update" onClick={() => dispatch({ type: "updated" })}>
          Update every 10th row
        </button>
        <button id="updateone" onClick={() => dispatch({ type: "oneUpdated" })}>
          Update one row
        </button>
        <button id="clear" onClick={() => dispatch({ type: "cleared" })}>
          Clear
        </button>
        <button id="swaprows" onClick={() => dispatch({ type: "swapped" })}>
          Swap rows
        </button>
      </div>
      <table>
        <tbody id="tbody">
          {state.rows.map((row) => (
            <RowView
              key={row.id}
              row={row}
              selected={row.id === state.selected}
              dispatch={dispatch}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const root = document.getElementById("root")

if (root !== null) createRoot(root).render(<App />)
