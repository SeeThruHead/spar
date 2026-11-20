# Coming from React

| React                                             | Spar                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| A component function that runs on every render    | `compose(...enhancers)((props) => <jsx />)`: the enhancers run once on mount, the view once  |
| Higher-order components, recompose                | Enhancers: plain functions from the props so far to an Effect of more props                  |
| `useState`                                        | `withUiState(name, Schema, initial)` for screen state, a store for app state                 |
| `useEffect` with a dependency array and a cleanup | `withEffect(...)`: Effect code in the component's scope; cleanup is the scope closing        |
| `useMemo`, `useCallback`, `memo`                  | Not needed: nothing re-runs                                                                  |
| `useContext`                                      | `withStore(Store, ...)` and services in the enhancers' requirements, provided at `App.mount` |
| `useQuery`                                        | `withQuery(name, TheQuery, (props) => input)`                                                |
| `{cond && <X />}`, `cond ? <A /> : <B />`         | `<Show when={props.open}>...</Show>`                                                         |
| `{items.map((item) => <Row key={item.id} />)}`    | `<For each={props.items} by={(item) => item.id}>{(item) => <Row item={item} />}</For>`       |
| `useRef` and `ref`                                | `Handle.make` and `ref={handle}`                                                             |
| Error boundaries                                  | `View.recover` for expected errors (typed), `View.crash` for defects                         |
| Suspense                                          | `View.pending(Placeholder)`                                                                  |
| Portals                                           | `View.portal`                                                                                |
| React Router                                      | `Router.route`, `Router.outlet`, `router.link`                                               |
| Redux and middleware                              | `Store.Tag`, `Store.after`, `Store.afterLatest`, `Store.afterLeading`, `Store.outbox`        |
| Testing Library                                   | `spar/testing` (it uses the same queries by role)                                            |

## Things that will feel different

- **The view only draws.** It cannot fetch or run an Effect, and the build rejects `.map` and
  ternaries over JSX inside it. Lists are `For`, conditions are `Show`, data comes from enhancers.
- **Props are not reactive by themselves.** A changing value is a `Reactive<A>` and you pass that.
  A plain prop is fixed for the life of the component.
- **Children are tags, as in React.** `<Dropdown label="Sort by" items={...} onPick={...} />`
  inside a view, each keeping its own UI state with nothing wired. A component that can still
  fail is not a tag until `View.recover` handles the failure, so errors stay in the types.
- **A text input's value is UI state or a form field.** Binding it to a store selector or query
  data does not compile, because whatever changes that value would replace what is being typed.
- **Handlers are values.** `onClick={store.commands.reset()}` is an Effect, not a callback. A
  function is only needed when the handler reads the event.
- **Event names follow the DOM.** `onKeydown`, not `onKeyDown`.
