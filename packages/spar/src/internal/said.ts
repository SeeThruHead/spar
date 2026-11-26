export type Kind = "build" | "run" | "types" | "tools"

export type Diagnostic = {
  readonly kind: Kind
  readonly what: string
  readonly fix: string
}

export const atRun = {
  SPAR_COMPONENT_WAITED: {
    kind: "run",
    what: "A component took a frame or more before its children could mount, so their queries started late.",
    fix: "Find what its Effect waits for, usually a service call that loads data, and move it to a Query the component asks for.",
  },
  SPAR_QUERY_CHAIN: {
    kind: "run",
    what: "Requests ran one after another: each could start only when the one before had answered.",
    fix: "If a later request does not need the earlier answer, make its input from something that is there already (a route param, a prop, a store), so they start together. If it does need it, have the backend answer both in one call, or preload the page.",
  },
  SPAR_PART_CRASHED: {
    kind: "run",
    what: "A part of the page crashed.",
    fix: "Read the defect that follows. If the part is wrapped in View.crash the rest of the page kept working; fix the cause in the component the report names.",
  },
  SPAR_DUPLICATE_CALL: {
    kind: "run",
    what: "The same request was made again while an identical one was still on its way.",
    fix: "Load it once with a Query and let each component that needs it ask for it (yield* TheQuery.ask(input)): one request runs for each input and everyone shares the answer. Do not fetch in a component and pass the data down, and do not fetch the same thing once in each row.",
  },
  SPAR_TYPING_REPLACED: {
    kind: "run",
    what: "A field the user typed in was given a different value by something that began before their last keystroke, so what they typed since was replaced.",
    fix: "A text input's value can only be UI state or a form field (anything else is a type error), so this comes from writing that UI state from something slow. Do not copy a saved or loaded value back into a field that is being edited. Keep what is typed as its own state (a form field or UI state) and keep the server's copy beside it: show the field as saved when the answer matches what was sent, and never write the answer into the draft. If the answer must win, apply it only when the field's text is still what was sent.",
  },
  SPAR_REFUSALS_PILED_UP: {
    kind: "run",
    what: "A command was refused three times while one task of its store ran. Something kept asking for what the store would not do, usually a button that still looks pressable.",
    fix: 'Show that the work is under way and stop offering the command while it runs: read store.running.<task> to disable or hide what sends it. If the command should work while the task runs, take it out of the task\'s refuses. If pressing again should start over, give the task mode: "switch" and leave it out of its own refuses.',
  },
  SPAR_DUPLICATE_KEY: {
    kind: "run",
    what: "A keyed list has rows that share a key.",
    fix: "Give each row its own key in Reactive.mapBy, for example the row's id and not its index or label.",
  },
  SPAR_UNKNOWN_ACTION: {
    kind: "run",
    what: "The log holds an action this store does not define.",
    fix: "Load the log into the version of the store that wrote it, or add the action back.",
  },
  SPAR_COMPONENT_OUTSIDE_A_VIEW: {
    kind: "run",
    what: "A component was written in JSX that is not drawn by a component, so it has no services to run with.",
    fix: "Put the component's JSX in the inline view at the end of a compose(...)(...), or in a For or Show inside one.",
  },
  SPAR_NO_PAGE_ON_SERVER: {
    kind: "run",
    what: "There is no page on a server.",
    fix: "Do not measure, focus or scroll while rendering on the server. Do it in a handler or after the browser has taken over.",
  },
  SPAR_NOT_ON_SCREEN: {
    kind: "run",
    what: "A test expected something and the screen never showed it.",
    fix: "Check the role and name asked for against what the view draws, and that the data it needs was provided in the test's layer.",
  },
  SPAR_PLAY_NOT_SETTLED: {
    kind: "run",
    what: "A Play test waited for the page to stop changing, and it kept changing.",
    fix: "Look for work that never ends without waiting on time: a loop that writes on every round, or a stream that never pauses. Work that waits on time is moved with TestClock.adjust and does not keep a page from settling.",
  },
  SPAR_PLAY_NOT_ON_PAGE: {
    kind: "run",
    what: "A Play test asked for something by role and name, and the settled page did not have it.",
    fix: "Check the role and name against what the view draws, and that the test's layer answers what the page needs. A Play waits only until the page settles; time that has to pass is moved with TestClock.adjust first.",
  },
  SPAR_REPLAY_DIVERGED: {
    kind: "run",
    what: "A recorded session was replayed against the store, and one of its steps made a different state than it did when it was recorded.",
    fix: "Read the step the report names, and the recorded and replayed states beside it. If the change is a bug, fix the action's reducer. If the new state is right, record the session again from the devtools.",
  },
  SPAR_REPLAY_UNREADABLE: {
    kind: "run",
    what: "A recorded session holds a state or payload that the store's schemas no longer read.",
    fix: "The store's state or that action's payload schema changed since the session was recorded. Record it again, or keep the old shape readable with a Schema transformation.",
  },
} as const satisfies Readonly<Record<string, Diagnostic>>

export type RunCode = keyof typeof atRun

const frame = /\(?([^()\s@]+):(\d+):(\d+)\)?$/

const withoutOrigin = (address: string): string =>
  address.replace(/^[a-z]+:\/\/[^/]*/, "").replace(/\?[^:]*/, "")

export const locationIn = (stack: string | undefined, skip: number): string =>
  (stack ?? "")
    .split("\n")
    .flatMap((line) => {
      const parts = frame.exec(line.trim())

      return parts === null ? [] : [withoutOrigin(parts.slice(1).join(":"))]
    })
    .at(skip) ?? ""

const guide = (code: string): string => `LLMS.md, section "${code}"`

export type Where = {
  readonly said?: string
  readonly in?: ReadonlyArray<string>
  readonly at?: string
}

export const described = (code: string, found: Diagnostic, options: Where): string =>
  [
    `[${code}] ${options.said ?? found.what}`,
    ...(options.in === undefined || options.in.length === 0
      ? []
      : [`  in ${options.in.join(" > ")}`]),
    ...(options.at === undefined || options.at === "" ? [] : [`  at ${options.at}`]),
    `  fix: ${found.fix}`,
    `  see: ${guide(code)}`,
  ].join("\n")

export const brief = (code: RunCode): string => `[${code}] ${atRun[code].what}`

export const text = (code: RunCode, options: Where = {}): string =>
  described(code, atRun[code], options)
