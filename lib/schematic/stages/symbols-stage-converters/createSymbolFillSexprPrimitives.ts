import { parseColor } from "../utils/parseColor"

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

export function createSymbolFillSexprPrimitives({
  isFilled,
  fillColor,
  fallbackFillType = "background",
}: SymbolFillSexprOptions): KicadSexprPrimitive[] {
  if (!isFilled) return [["type", "none"]]

  const parsedFillColor = fillColor ? parseColor(fillColor) : undefined
  if (!parsedFillColor) return [["type", fallbackFillType]]

  return [
    ["type", "color"],
    [
      "color",
      parsedFillColor.r,
      parsedFillColor.g,
      parsedFillColor.b,
      parsedFillColor.a,
    ],
  ]
}
