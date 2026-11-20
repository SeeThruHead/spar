import { Schema } from "effect"
import {
  For,
  Props,
  Reactive,
  Show,
  UiState,
  compose,
  withHandlers,
  withProps,
  withUiState,
} from "spar"
import type { View } from "spar"

export type Folder = { readonly name: string; readonly folders: ReadonlyArray<Folder> }

export const Folder: Schema.Codec<Folder> = Schema.Struct({
  name: Schema.String,
  folders: Schema.Array(Schema.suspend((): Schema.Codec<Folder> => Folder)),
})

const nameOf = (folder: Folder): string => folder.name

export const FolderRow: View.Component<{ readonly folder: Reactive.Reactive<Folder> }> = compose(
  withProps({ folder: Props.Reactive(Folder) }),
  withUiState("open", Schema.Boolean, false),
  withHandlers((props) => ({
    name: Reactive.map(props.folder, nameOf),
    folders: Reactive.map(props.folder, (folder) => folder.folders),
    empty: Reactive.map(props.folder, (folder) => folder.folders.length === 0),
    onToggle: UiState.update(props.open, (open) => !open),
  })),
)((props) => (
  <li>
    <button
      type="button"
      aria-expanded={props.open}
      disabled={props.empty}
      onClick={props.onToggle}
    >
      {props.name}
    </button>
    <Show when={props.open}>
      <ul>
        <For each={props.folders} by={nameOf}>
          {(folder) => <FolderRow folder={folder} />}
        </For>
      </ul>
    </Show>
  </li>
))

export const FolderTree = compose(withProps({ root: Folder }))((props) => (
  <ul aria-label="Folders">
    <FolderRow folder={Reactive.succeed(props.root)} />
  </ul>
))
