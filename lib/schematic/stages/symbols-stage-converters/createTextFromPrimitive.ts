import { createCircuitJsonTextFont } from "../../../utils/create-circuit-json-text-font"
import { getTextJustificationFromAnchor } from "../utils/getTextJustificationFromAnchor"
import { SymbolText, TextEffects, TextEffectsJustify } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"

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
    rotation?: number
  }
  transform: Matrix
  scale: number
}): SymbolText {
  const symbolText = new SymbolText()

  const scaledPos = applyToPoint(transform, { x: schText.x, y: schText.y })

  symbolText.value = schText.text
  symbolText.at = [scaledPos.x, scaledPos.y, schText.rotation ?? 0]

  // Scale font size to match symbol scaling
  const scaledFontSize = schText.fontSize * scale
  const font = createCircuitJsonTextFont({
    text: schText.text,
    font_size: scaledFontSize,
  })
  const justify = getTextJustificationFromAnchor(schText.anchor)
  symbolText.effects = new TextEffects({
    font,
    justify: justify ? new TextEffectsJustify(justify) : undefined,
  })

  return symbolText
}
