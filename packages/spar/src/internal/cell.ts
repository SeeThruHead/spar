export type Listener<A> = (value: A) => void

export type Stop = () => void

export type Cell<A> = {
  readonly read: () => A
  readonly write: (value: A) => void
  readonly subscribe: (listener: Listener<A>) => Stop
}

type Listeners<A> = Listener<A> | Set<Listener<A>> | undefined

const withAnother = <A>(listeners: Listeners<A>, listener: Listener<A>): Listeners<A> => {
  if (listeners === undefined) return listener
  if (listeners instanceof Set) return listeners.add(listener)

  return new Set([listeners, listener])
}

const without = <A>(listeners: Listeners<A>, listener: Listener<A>): Listeners<A> => {
  if (listeners === listener) return undefined
  if (listeners instanceof Set) listeners.delete(listener)

  return listeners
}

const tell = <A>(listeners: Listeners<A>, value: A): void => {
  if (listeners === undefined) return
  if (listeners instanceof Set) return listeners.forEach((listener) => listener(value))

  listeners(value)
}

class Held<A> implements Cell<A> {
  value: A
  listeners: Listeners<A> = undefined

  constructor(initial: A) {
    this.value = initial
  }

  read(): A {
    return this.value
  }

  write(value: A): void {
    if (Object.is(this.value, value)) return

    this.value = value
    tell(this.listeners, value)
  }

  subscribe(listener: Listener<A>): Stop {
    this.listeners = withAnother(this.listeners, listener)

    return () => {
      this.listeners = without(this.listeners, listener)
    }
  }
}

export const make = <A>(initial: A): Cell<A> => new Held(initial)

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

export type Owner = Array<Stop>

export const owner = (): Owner => []

export const own = (held: Owner, stop: Stop): void => {
  held.push(stop)
}

export const release = (held: Owner): void => {
  held.splice(0).forEach((stop) => stop())
}
