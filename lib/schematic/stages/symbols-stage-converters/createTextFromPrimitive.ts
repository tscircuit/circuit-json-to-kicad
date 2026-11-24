import {
  SymbolText,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
} from "kicadts"
import type { Matrix } from "transformation-matrix"
import {
  roundSchematicCoordinate,
  transformSymbolPoint,
} from "../utils/schematicCoordinates"
import { getTextJustificationFromAnchor } from "../utils/getTextJustificationFromAnchor"

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
  transform: Matrix
  scale: number
}): SymbolText {
  const symbolText = new SymbolText()

  const scaledPos = transformSymbolPoint(transform, {
    x: schText.x,
    y: schText.y,
  })

  symbolText.value = schText.text
  symbolText.at = [scaledPos.x, scaledPos.y, 0]

  // Scale font size to match symbol scaling
  const scaledFontSize = roundSchematicCoordinate(schText.fontSize * scale)
  const font = new TextEffectsFont()
  font.size = { height: scaledFontSize, width: scaledFontSize }

  // The text position is the anchor point, so keep the authored alignment;
  // otherwise non-centered text shifts relative to the rest of the artwork.
  const justification = getTextJustificationFromAnchor(schText.anchor)
  symbolText.effects = new TextEffects({
    font,
    justify: justification ? new TextEffectsJustify(justification) : undefined,
  })

  return symbolText
}
