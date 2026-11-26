import { Context, Scheduler } from "effect"

export const soon = (task: () => void): (() => void) => {
  const channel = new MessageChannel()
  const close = (): void => {
    channel.port1.close()
    channel.port2.close()
  }

  channel.port1.addEventListener(
    "message",
    () => {
      close()
      task()
    },
    { once: true },
  )
  channel.port1.start()
  channel.port2.postMessage(0)

  return close
}

export const browserScheduler = new Scheduler.MixedScheduler("async", soon)

export const OnBrowserScheduler = Context.Reference<boolean>("spar/internal/OnBrowserScheduler", {
  defaultValue: () => true,
})
