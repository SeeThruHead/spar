export type Listener<A> = (value: A) => void

export type Cell<A> = {
  readonly read: () => A
  readonly write: (value: A) => void
  readonly subscribe: (listener: Listener<A>) => () => void
}

export const make = <A>(initial: A): Cell<A> => {
  const held = { value: initial }
  const listeners = new Set<Listener<A>>()

  return {
    read: () => held.value,
    write: (value) => {
      if (Object.is(held.value, value)) return

      held.value = value
      listeners.forEach((listener) => listener(value))
    },
    subscribe: (listener) => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const never: unique symbol = Symbol("never seen")

export const mapped = <A, B>(f: (value: A) => B, listener: Listener<B>): Listener<A> => {
  const seen: { last: B | typeof never } = { last: never }

  return (value) => {
    const next = f(value)
    if (Object.is(seen.last, next)) return

    seen.last = next
    listener(next)
  }
}

export const guarded =
  <A>(listener: Listener<A>, onError: (defect: unknown) => void): Listener<A> =>
  (value) => {
    try {
      listener(value)
    } catch (defect) {
      onError(defect)
    }
  }
