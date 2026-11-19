export type Row = {
  readonly id: number
  readonly label: string
}

const adjectives = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy",
]

const colours = [
  "red",
  "yellow",
  "blue",
  "green",
  "pink",
  "brown",
  "purple",
  "brown",
  "white",
  "black",
  "orange",
]

const nouns = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
]

const scramble = (id: number, salt: number): number => Math.imul(id + salt, 2654435761) >>> 0

const pick = (words: ReadonlyArray<string>, id: number, salt: number): string =>
  words.at(scramble(id, salt) % words.length) ?? ""

const labelFor = (id: number): string =>
  `${pick(adjectives, id, 1)} ${pick(colours, id, 2)} ${pick(nouns, id, 3)}`

export const makeRows = (count: number, firstId: number): ReadonlyArray<Row> =>
  Array.from({ length: count }, (_, index) => ({
    id: firstId + index,
    label: labelFor(firstId + index),
  }))

export const exclaimEveryTenth = (rows: ReadonlyArray<Row>): ReadonlyArray<Row> =>
  rows.map((row, index) => (index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row))

export const exclaimMiddle = (rows: ReadonlyArray<Row>): ReadonlyArray<Row> =>
  rows.map((row, index) =>
    index === Math.floor(rows.length / 2) ? { ...row, label: `${row.label} !!!` } : row,
  )

export const swapSecondAndSecondLast = <A>(rows: ReadonlyArray<A>): ReadonlyArray<A> => {
  const second = rows.at(1)
  const secondLast = rows.at(-2)
  if (second === undefined || secondLast === undefined || rows.length < 4) return rows

  return rows.with(1, secondLast).with(rows.length - 2, second)
}
