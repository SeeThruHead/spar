const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

const digit = new Map(alphabet.split("").map((char, index) => [char, index]))

type Decoding = {
  readonly values: ReadonlyArray<number>
  readonly value: number
  readonly shift: number
}

const decoded = (segment: string): ReadonlyArray<number> =>
  segment.split("").reduce<Decoding>(
    (state, char) => {
      const bits = digit.get(char) ?? 0
      const value = state.value + ((bits & 31) << state.shift)
      if (bits & 32) return { ...state, value, shift: state.shift + 5 }

      const signed = value & 1 ? -(value >> 1) : value >> 1

      return { values: [...state.values, signed], value: 0, shift: 0 }
    },
    { values: [], value: 0, shift: 0 },
  ).values

const grouped = (source: string): string => {
  const effect = /effect\/dist\/(.+)\.js$/.exec(source)
  if (effect) return `effect/${effect[1]}`

  const spar = /packages\/spar\/src\/(.+)$/.exec(source)
  if (spar) return `spar/${spar[1]}`

  return source.replace(/^.*node_modules\//, "").replace(/^(\.\.\/)+/, "")
}

type Walk = { readonly source: number; readonly lines: ReadonlyArray<number> }

export const sourceOfLines = (mapText: string): ReadonlyArray<string> => {
  const map: { readonly mappings: string; readonly sources: ReadonlyArray<string> } =
    JSON.parse(mapText)
  const walked = map.mappings.split(";").reduce<Walk>(
    (walk, line) => {
      const segments = line.split(",").filter((segment) => segment.length > 0)
      const firstSource = segments
        .map(decoded)
        .reduce<{ readonly source: number; readonly first: number | undefined }>(
          (state, values) => {
            const source = values.length > 1 ? state.source + (values[1] ?? 0) : state.source

            return { source, first: state.first ?? (values.length > 1 ? source : undefined) }
          },
          { source: walk.source, first: undefined },
        )

      return {
        source: firstSource.source,
        lines: [...walk.lines, firstSource.first ?? walk.source],
      }
    },
    { source: 0, lines: [] },
  )

  return walked.lines.map((source) => grouped(map.sources[source] ?? "?"))
}
