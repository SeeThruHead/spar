import { Array } from "effect"

export type Part = {
  readonly open: number
  readonly close: number
  readonly html: string
  readonly self: string
  readonly children: ReadonlyArray<Part>
}

export type Replacement = { readonly open: number; readonly close: number; readonly html: string }

type Frame = {
  readonly open: number
  readonly html: string
  readonly self: string
  readonly children: ReadonlyArray<Part>
}

type Stack = { readonly frame: Frame; readonly below: Stack | undefined }

type Reading = { readonly opens: number; readonly closes: number; readonly stack: Stack }

export const opening = "<!--spar(-->"

export const closing = "<!--spar)-->"

const tokens = /(<!--spar\(-->|<!--spar\)-->)/

const hole = "\u0000"

const empty = (open: number): Frame => ({ open, html: "", self: "", children: [] })

const withText = (frame: Frame, text: string): Frame => ({
  ...frame,
  html: `${frame.html}${text}`,
  self: `${frame.self}${text}`,
})

const withPart = (frame: Frame, part: Part): Frame => ({
  ...frame,
  html: `${frame.html}${opening}${part.html}${closing}`,
  self: `${frame.self}${opening}${hole}${closing}`,
  children: [...frame.children, part],
})

const closed = (reading: Reading, below: Stack): Reading => ({
  opens: reading.opens,
  closes: reading.closes + 1,
  stack: {
    ...below,
    frame: withPart(below.frame, { ...reading.stack.frame, close: reading.closes }),
  },
})

const step = (reading: Reading, token: string): Reading => {
  if (token === opening) {
    return {
      opens: reading.opens + 1,
      closes: reading.closes,
      stack: { frame: empty(reading.opens), below: reading.stack },
    }
  }
  if (token === closing && reading.stack.below !== undefined) {
    return closed(reading, reading.stack.below)
  }

  return { ...reading, stack: { ...reading.stack, frame: withText(reading.stack.frame, token) } }
}

export const partsOf = (marked: string): Part => {
  const read = marked
    .split(tokens)
    .filter((token) => token !== "")
    .reduce(step, { opens: 0, closes: 0, stack: { frame: empty(-1), below: undefined } })

  return { ...read.stack.frame, close: -1 }
}

export const replacements = (sent: Part, now: Part): ReadonlyArray<Replacement> => {
  if (sent.self !== now.self || sent.children.length !== now.children.length) {
    return [{ open: sent.open, close: sent.close, html: now.html }]
  }

  return Array.zip(sent.children, now.children).flatMap(([before, after]) =>
    replacements(before, after),
  )
}
