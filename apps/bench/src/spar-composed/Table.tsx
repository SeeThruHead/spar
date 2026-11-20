import { For, Reactive, compose, withStore } from "spar"
import { TableStore } from "../spar/TableStore.ts"

export const Table = compose(
  withStore(TableStore, (store) => ({
    rows: store.select.rows,
    selected: store.select.selected,
    select: (id: number) => store.commands.selected({ id }),
    remove: (id: number) => store.commands.removed({ id }),
    onRun: store.commands.created({ count: 1000 }),
    onRunLots: store.commands.created({ count: 10_000 }),
    onAdd: store.commands.appended({ count: 1000 }),
    onUpdate: store.commands.updated(),
    onUpdateOne: store.commands.oneUpdated(),
    onClear: store.commands.cleared(),
    onSwap: store.commands.swapped(),
  })),
)((props) => (
  <div id="main">
    <div class="jumbotron">
      <h1>Spar, composed</h1>
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
      <tbody id="tbody">
        <For each={props.rows} by={(row) => String(row.id)}>
          {(row, id) => (
            <tr class={{ danger: Reactive.map(props.selected, (now) => String(now) === id) }}>
              <td class="col-md-1">{id}</td>
              <td class="col-md-4">
                <a class="lbl" onClick={props.select(Number(id))}>
                  {Reactive.map(row, (current) => current.label)}
                </a>
              </td>
              <td class="col-md-1">
                <a class="remove" onClick={props.remove(Number(id))}>
                  x
                </a>
              </td>
              <td class="col-md-6" />
            </tr>
          )}
        </For>
      </tbody>
    </table>
  </div>
))
