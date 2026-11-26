import { Window } from "happy-dom"

export type Page = {
  readonly window: object
  readonly target: HTMLElement
  readonly overlays: HTMLElement
}

export const page = (): Page => {
  const window = new Window()
  const document: Document = Reflect.get(Object(window), "document")
  const target = document.createElement("div")
  const overlays = document.createElement("div")

  document.body.append(target, overlays)

  return { window, target, overlays }
}
