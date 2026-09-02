export type ParsedColor = {
  r: number
  g: number
  b: number
  a: number
}

export function parseColor(color: string): ParsedColor | undefined {
  const rgbMatch = color.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/i,
  )
  if (rgbMatch) {
    return {
      r: Number(rgbMatch[1]),
      g: Number(rgbMatch[2]),
      b: Number(rgbMatch[3]),
      a: rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]),
    }
  }

  const hexDigits = color.startsWith("#") ? color.slice(1) : color
  if (![3, 4, 6, 8].includes(hexDigits.length)) return undefined
  if (!/^[0-9a-f]+$/i.test(hexDigits)) return undefined

  const expandedHexDigits =
    hexDigits.length <= 4
      ? [...hexDigits].map((digit) => `${digit}${digit}`).join("")
      : hexDigits

  return {
    r: Number.parseInt(expandedHexDigits.slice(0, 2), 16),
    g: Number.parseInt(expandedHexDigits.slice(2, 4), 16),
    b: Number.parseInt(expandedHexDigits.slice(4, 6), 16),
    a:
      expandedHexDigits.length === 8
        ? Number.parseInt(expandedHexDigits.slice(6, 8), 16) / 255
        : 1,
  }
}
