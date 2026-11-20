export const escaped = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

export const unescaped = (text: string): string =>
  text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")

const colors = {
  keyword: "#d6a6f5",
  string: "#b4e68c",
  number: "#ffab8f",
  type: "#8fd0ff",
  call: "#ffdf99",
  tag: "#ffa3b5",
  note: "#aab4c4",
} as const

const keywords =
  /^(?:import|from|export|const|type|readonly|return|function|yield|class|extends|static|new|if|satisfies|await|async)$/

const tokens =
  /(\/\/[^\n]*|#[^\n]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|<\/[a-z][a-z0-9]*>|(?<=[\s(])<[a-z][a-z0-9]*|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+\b)/

const colorOf = (segment: string, next: string): string | undefined => {
  if (segment.startsWith("//") || segment.startsWith("#")) return colors.note
  if (/^["'`]/.test(segment)) return colors.string
  if (segment.startsWith("<")) return colors.tag
  if (/^\d/.test(segment)) return colors.number
  if (keywords.test(segment)) return colors.keyword
  if (/^[A-Z]/.test(segment)) return colors.type
  if (next.startsWith("(")) return colors.call

  return undefined
}

const paint = (segment: string, color: string | undefined): string =>
  color === undefined ? escaped(segment) : `<span style="color:${color}">${escaped(segment)}</span>`

export const highlight = (source: string): string => {
  const segments = source.trimEnd().split(tokens)

  return segments
    .map((segment, index) =>
      paint(segment, index % 2 === 1 ? colorOf(segment, segments[index + 1] ?? "") : undefined),
    )
    .join("")
}
