import { For, batch, createSelector, createSignal } from "solid-js"
import type { Accessor, Setter } from "solid-js"
import { render } from "solid-js/web"
import { makeRows, swapSecondAndSecondLast } from "../shared/rows.ts"

type SolidRow = {
  readonly id: number
  readonly label: Accessor<string>
  readonly setLabel: Setter<string>
}

const build = (count: number, firstId: number): ReadonlyArray<SolidRow> =>
  makeRows(count, firstId).map((row) => {
    const [label, setLabel] = createSignal(row.label)

    return { id: row.id, label, setLabel }
  })

const App = () => {
  const [rows, setRows] = createSignal<ReadonlyArray<SolidRow>>([])
  const [selected, setSelected] = createSignal(0)
  const [nextId, setNextId] = createSignal(1)
  const isSelected = createSelector(selected)

  const create = (count: number) =>
    batch(() => {
      setRows(build(count, nextId()))
      setNextId(nextId() + count)
      setSelected(0)
    })

  const append = (count: number) =>
    batch(() => {
      setRows([...rows(), ...build(count, nextId())])
      setNextId(nextId() + count)
    })

  const update = () =>
    batch(() =>
      rows().forEach((row, index) => {
        if (index % 10 === 0) row.setLabel((label) => `${label} !!!`)
      }),
    )

  const clear = () =>
    batch(() => {
      setRows([])
      setSelected(0)
    })

  return (
    <div id="main">
      <div class="jumbotron">
        <h1>Solid</h1>
        <button id="run" onClick={() => create(1000)}>
          Create 1,000 rows
        </button>
        <button id="runlots" onClick={() => create(10_000)}>
          Create 10,000 rows
        </button>
        <button id="add" onClick={() => append(1000)}>
          Append 1,000 rows
        </button>
        <button id="update" onClick={update}>
          Update every 10th row
        </button>
        <button id="clear" onClick={clear}>
          Clear
        </button>
        <button id="swaprows" onClick={() => setRows(swapSecondAndSecondLast(rows()))}>
          Swap rows
        </button>
      </div>
      <table>
        <tbody id="tbody">
          <For each={rows()}>
            {(row) => (
              <tr class={isSelected(row.id) ? "danger" : ""}>
                <td class="col-md-1">{row.id}</td>
                <td class="col-md-4">
                  <a class="lbl" onClick={() => setSelected(row.id)}>
                    {row.label()}
                  </a>
                </td>
                <td class="col-md-1">
                  <a
                    class="remove"
                    onClick={() => setRows(rows().filter((other) => other.id !== row.id))}
                  >
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
  )
}

const root = document.getElementById("root")

if (root !== null) render(() => <App />, root)
