import { Array, DateTime, Option } from "effect"

const dayOf = (iso: string): DateTime.Utc => DateTime.makeUnsafe(`${iso}T00:00:00Z`)

const isoOf = (day: DateTime.Utc): string => DateTime.formatIsoDateUtc(day)

export const monthOf = (iso: string): string => iso.slice(0, 7)

const weekdayOf = (iso: string): number => DateTime.getPartUtc(dayOf(iso), "weekDay")

export const dayIn = (month: string, index: number): string => {
  const first = `${month}-01`

  return isoOf(DateTime.add(dayOf(first), { days: index - weekdayOf(first) }))
}

export const gridOf = (month: string): ReadonlyArray<string> =>
  Array.makeBy(42, (index) => dayIn(month, index))

export const indexIn = (iso: string): number => gridOf(monthOf(iso)).indexOf(iso)

export const shiftedMonth = (iso: string, by: number): string =>
  isoOf(DateTime.add(dayOf(iso), { months: by }))

const moves: Readonly<Record<string, (iso: string) => string>> = {
  ArrowLeft: (iso) => isoOf(DateTime.subtract(dayOf(iso), { days: 1 })),
  ArrowRight: (iso) => isoOf(DateTime.add(dayOf(iso), { days: 1 })),
  ArrowUp: (iso) => isoOf(DateTime.subtract(dayOf(iso), { days: 7 })),
  ArrowDown: (iso) => isoOf(DateTime.add(dayOf(iso), { days: 7 })),
  Home: (iso) => isoOf(DateTime.subtract(dayOf(iso), { days: weekdayOf(iso) })),
  End: (iso) => isoOf(DateTime.add(dayOf(iso), { days: 6 - weekdayOf(iso) })),
  PageUp: (iso) => shiftedMonth(iso, -1),
  PageDown: (iso) => shiftedMonth(iso, 1),
}

export const movedBy = (key: string, iso: string): Option.Option<string> =>
  Option.map(Option.fromNullishOr(moves[key]), (move) => move(iso))

export const monthTitle = (month: string): string =>
  DateTime.formatUtc(dayOf(`${month}-01`), {
    locale: "en-US",
    month: "long",
    year: "numeric",
  })

export const dayTitle = (iso: string): string =>
  DateTime.formatUtc(dayOf(iso), {
    locale: "en-US",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

export const dayNumber = (iso: string): string => String(Number(iso.slice(8, 10)))

export const isoDay = (day: DateTime.DateTime): string => isoOf(DateTime.toUtc(day))
