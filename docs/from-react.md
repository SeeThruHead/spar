# Coming from React

| React                                             | Spar                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| A component function that runs on every render    | A view that runs once, plus one Effect that runs once on mount           |
| `useState`                                        | `UiState.make` for screen state, a store for app state                   |
| `useEffect` with a dependency array and a cleanup | Effect code in the component's scope; cleanup is the scope closing       |
| `useMemo`, `useCallback`, `memo`                  | Not needed: nothing re-runs                                              |
| `useContext`                                      | Services in the Effect's requirements, provided as layers at `App.mount` |
| `{cond && <X />}`, `cond ? <A /> : <B />`         | `Reactive.when(X, props)` in the Effect                                  |
| `{items.map((item) => <Row key={item.id} />)}`    | `Reactive.mapBy((item) => item.id, Row, toProps)` in the Effect          |
| `useRef` and `ref`                                | `Handle.make` and `ref={handle}`                                         |
| Error boundaries                                  | `View.recover` for expected errors (typed), `View.crash` for defects     |
| Suspense                                          | `View.pending(Placeholder)`                                              |
| Portals                                           | `View.portal`                                                            |
| React Router                                      | `Router.route`, `Router.outlet`, `router.link`                           |
| Redux and middleware                              | `Store.Tag`, `Store.after`, `Store.outbox`                               |
| Testing Library                                   | `spar/testing` (it uses the same queries by role)                        |

## Things that will feel different

- **JSX holds no logic.** A view cannot map, branch or fetch. The build step rejects JSX inside an
  expression. Lists, conditionals and children that need services are built in the component's
  Effect and handed to the view as elements.
- **Props are not reactive by themselves.** A changing value is a `Reactive<A>` and you pass that.
  A plain prop is fixed for the life of the component.
- **A connected component is not a tag.** `<Counter />` does not compile if `Counter` needs a
  service; mount it with `View.child(Counter, props)` in the parent's Effect. This is what keeps
  errors and services in the types.
- **Handlers are values.** `onClick={store.commands.reset()}` is an Effect, not a callback. A
  function is only needed when the handler reads the event.
- **Event names follow the DOM.** `onKeydown`, not `onKeyDown`.
