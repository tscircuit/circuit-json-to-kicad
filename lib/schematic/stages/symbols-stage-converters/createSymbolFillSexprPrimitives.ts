type KicadSexprPrimitive =
  | string
  | number
  | boolean
  | null
  | KicadSexprPrimitive[]

export type SymbolFillSexprOptions = {
  isFilled: boolean
  fillColor?: string
  fallbackFillType?: "background" | "outline"
}

function parseHexColor(fillColor: string):
  | {
      red: number
      green: number
      blue: number
      alpha: number
    }
  | undefined {
  const hexDigits = fillColor.startsWith("#") ? fillColor.slice(1) : fillColor
  if (![3, 4, 6, 8].includes(hexDigits.length)) return undefined
  if (!/^[0-9a-f]+$/i.test(hexDigits)) return undefined

  const expandedHexDigits =
    hexDigits.length <= 4
      ? [...hexDigits].map((digit) => `${digit}${digit}`).join("")
      : hexDigits

  return {
    red: Number.parseInt(expandedHexDigits.slice(0, 2), 16),
    green: Number.parseInt(expandedHexDigits.slice(2, 4), 16),
    blue: Number.parseInt(expandedHexDigits.slice(4, 6), 16),
    alpha:
      expandedHexDigits.length === 8
        ? Number.parseInt(expandedHexDigits.slice(6, 8), 16) / 255
        : 1,
  }
}

export function createSymbolFillSexprPrimitives({
  isFilled,
  fillColor,
  fallbackFillType = "background",
}: SymbolFillSexprOptions): KicadSexprPrimitive[] {
  if (!isFilled) return [["type", "none"]]

  const parsedFillColor = fillColor ? parseHexColor(fillColor) : undefined
  if (!parsedFillColor) return [["type", fallbackFillType]]

  return [
    ["type", "color"],
    [
      "color",
      parsedFillColor.red,
      parsedFillColor.green,
      parsedFillColor.blue,
      parsedFillColor.alpha,
    ],
  ]
}
