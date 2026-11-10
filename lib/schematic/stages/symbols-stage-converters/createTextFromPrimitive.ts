import { SymbolText, TextEffects, TextEffectsFont } from "kicadts"
import type { Point } from "circuit-json"
import { roundSchematicCoordinate } from "../utils/schematicCoordinates"

export function createTextFromPrimitive({
  schText,
  transform,
  scale,
}: {
  schText: {
    text: string
    x: number
    y: number
    fontSize: number
    anchor?: string
  }
  transform: (point: Point) => Point
  scale: number
}): SymbolText {
  const symbolText = new SymbolText()

  const scaledPos = transform({
    x: schText.x,
    y: schText.y,
  })

  symbolText.value = schText.text
  symbolText.at = [scaledPos.x, scaledPos.y, 0]

  // Scale font size to match symbol scaling
  const scaledFontSize = roundSchematicCoordinate(schText.fontSize * scale)
  const font = new TextEffectsFont()
  font.size = { height: scaledFontSize, width: scaledFontSize }
  symbolText.effects = new TextEffects({ font })

  return symbolText
}
