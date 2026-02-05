import type { PcbNoteText } from "circuit-json"
import { FpText, TextEffects, TextEffectsFont } from "kicadts"
import { applyToPoint, rotate, identity } from "transformation-matrix"

export function convertNoteTexts(
  noteTexts: PcbNoteText[],
  componentCenter: { x: number; y: number },
  componentRotation: number,
): FpText[] {
  const fpTexts: FpText[] = []

  for (const textElement of noteTexts) {
    const relX = textElement.anchor_position.x - componentCenter.x
    const relY = -(textElement.anchor_position.y - componentCenter.y)

    const rotationMatrix =
      componentRotation !== 0
        ? rotate((componentRotation * Math.PI) / 180)
        : identity()

    const rotatedPos = applyToPoint(rotationMatrix, { x: relX, y: relY })

    const fontSize = textElement.font_size || 1
    const font = new TextEffectsFont()
    font.size = { width: fontSize, height: fontSize }
    const textEffects = new TextEffects({ font })

    const fpText = new FpText({
      type: "user",
      text: textElement.text,
      position: { x: rotatedPos.x, y: rotatedPos.y, angle: 0 },
      layer: "F.Fab",
      effects: textEffects,
    })
    fpTexts.push(fpText)
  }

  return fpTexts
}
