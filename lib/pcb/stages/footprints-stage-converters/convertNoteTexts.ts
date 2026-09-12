import { createCircuitJsonTextFont } from "../../../utils/create-circuit-json-text-font"
import { createPcbTextJustify } from "../utils/CreatePcbTextJustify"
import type { PcbNoteText } from "circuit-json"
import { FpText, TextEffects } from "kicadts"
import { applyToPoint, rotate, identity } from "transformation-matrix"

export function convertNoteTexts(params: {
  noteTexts: PcbNoteText[]
  componentCenter: { x: number; y: number }
  componentRotation: number
}): FpText[] {
  const { noteTexts, componentCenter, componentRotation } = params
  const fpTexts: FpText[] = []

  for (const textElement of noteTexts) {
    const relX = textElement.anchor_position.x - componentCenter.x
    const relY = -(textElement.anchor_position.y - componentCenter.y)

    const rotationMatrix =
      componentRotation !== 0
        ? rotate((componentRotation * Math.PI) / 180)
        : identity()

    const rotatedPos = applyToPoint(rotationMatrix, { x: relX, y: relY })

    const layer = textElement.layer === "bottom" ? "B.Fab" : "F.Fab"
    const font = createCircuitJsonTextFont(textElement)
    const textEffects = new TextEffects({
      font,
      justify: createPcbTextJustify({
        anchorAlignment: textElement.anchor_alignment,
        kicadLayer: layer,
        isMirrored: textElement.is_mirrored_from_top_view,
      }),
    })

    const fpText = new FpText({
      type: "user",
      text: textElement.text,
      position: { x: rotatedPos.x, y: rotatedPos.y, angle: 0 },
      layer,
      effects: textEffects,
    })
    fpTexts.push(fpText)
  }

  return fpTexts
}
