import type { PcbNoteText } from "circuit-json"
import { FpText, TextEffects, TextEffectsFont } from "kicadts"
import { applyToPoint, rotate, identity } from "transformation-matrix"
import { createPcbTextJustify } from "../utils/CreatePcbTextJustify"

export function convertNoteTexts(params: {
  noteTexts: PcbNoteText[]
  componentCenter: { x: number; y: number }
  componentRotation: number
}): FpText[] {
  const { noteTexts, componentCenter, componentRotation } = params
  const fpTexts: FpText[] = []

  const layerMap: Record<string, string> = {
    top: "F.Fab",
    bottom: "B.Fab",
  }

  for (const textElement of noteTexts) {
    if (!textElement.text || !textElement.anchor_position) continue

    const relX = textElement.anchor_position.x - componentCenter.x
    const relY = -(textElement.anchor_position.y - componentCenter.y)

    const rotationMatrix =
      componentRotation !== 0
        ? rotate((componentRotation * Math.PI) / 180)
        : identity()

    const rotatedPos = applyToPoint(rotationMatrix, { x: relX, y: relY })

    const kicadLayer =
      layerMap[textElement.layer] || textElement.layer || "F.Fab"

    const fontSize = textElement.font_size || 1
    const font = new TextEffectsFont()
    font.size = { width: fontSize, height: fontSize }
    const textEffects = new TextEffects({ font })
    const justify = createPcbTextJustify({
      anchorAlignment: textElement.anchor_alignment,
      kicadLayer,
      isMirrored: (textElement as PcbNoteText & { is_mirrored?: boolean })
        .is_mirrored,
    })
    if (justify) {
      textEffects.justify = justify
    }

    const angle =
      (textElement as PcbNoteText & { ccw_rotation?: number }).ccw_rotation || 0

    const fpText = new FpText({
      type: "user",
      text: textElement.text,
      position: { x: rotatedPos.x, y: rotatedPos.y, angle },
      layer: kicadLayer,
      effects: textEffects,
    })
    fpTexts.push(fpText)
  }

  return fpTexts
}
