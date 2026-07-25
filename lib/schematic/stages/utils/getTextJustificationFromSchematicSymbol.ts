import { symbols, type TextPrimitive } from "schematic-symbols"

export type KicadTextJustification = {
  horizontal?: "left" | "right"
  vertical?: "top" | "bottom"
}

const getJustificationFromAnchor = (
  anchor: string | undefined,
): KicadTextJustification | undefined => {
  switch (anchor) {
    case "middle_left":
      return { horizontal: "left" }
    case "middle_right":
      return { horizontal: "right" }
    case "middle_top":
      return { vertical: "top" }
    case "middle_bottom":
      return { vertical: "bottom" }
    default:
      return undefined
  }
}

const isSchematicSymbolName = (
  symbolName: string,
): symbolName is keyof typeof symbols => symbolName in symbols

export const getTextJustificationFromSchematicSymbol = (
  symbolName: string | undefined,
  text: string,
): KicadTextJustification | undefined => {
  if (!symbolName || !isSchematicSymbolName(symbolName)) return undefined

  const symbol = symbols[symbolName]
  if (!symbol) return undefined

  const textPrimitive = symbol?.primitives?.find(
    (primitive): primitive is TextPrimitive =>
      primitive.type === "text" && primitive.text === text,
  )

  return getJustificationFromAnchor(textPrimitive?.anchor)
}
