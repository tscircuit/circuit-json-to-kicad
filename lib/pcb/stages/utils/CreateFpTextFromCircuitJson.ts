import type { PcbFabricationNoteText, PcbSilkscreenText } from "circuit-json"
import { FpText, TextEffects, TextEffectsFont } from "kicadts"
import { applyToPoint, rotate, identity } from "transformation-matrix"
import { createPcbTextJustify } from "./CreatePcbTextJustify"

/**
 * Creates footprint-local KiCad text from board-space silkscreen or fabrication
 * text. Positions are in mm: Circuit JSON has +X right and +Y up; KiCad has +X
 * right and +Y down. Undo the parent placement rotation for the local anchor;
 * KiCad text angles retain the board-space CCW rotation in degrees.
 */
export function createFpTextFromCircuitJson({
  textElement,
  componentCenter,
  componentRotation = 0,
}: {
  textElement: PcbSilkscreenText | PcbFabricationNoteText
  componentCenter: { x: number; y: number }
  componentRotation?: number
}): FpText | null {
  if (!textElement.text || !textElement.anchor_position) {
    return null
  }

  // Calculate position relative to component center
  // FpText positions are relative to the footprint origin
  const relativeX = textElement.anchor_position.x - componentCenter.x
  const relativeY = -(textElement.anchor_position.y - componentCenter.y)

  // Apply component rotation to text position using transformation matrix
  const rotationMatrix =
    componentRotation !== 0
      ? rotate((componentRotation * Math.PI) / 180)
      : identity()

  const rotatedPos = applyToPoint(rotationMatrix, {
    x: relativeX,
    y: relativeY,
  })

  const relativePosition = {
    x: rotatedPos.x,
    y: rotatedPos.y,
  }

  // Map circuit JSON layer names to KiCad layer names
  const isFabricationNote = textElement.type === "pcb_fabrication_note_text"
  const layerMap: Record<string, string> = isFabricationNote
    ? { top: "F.Fab", bottom: "B.Fab" }
    : { top: "F.SilkS", bottom: "B.SilkS" }
  const kicadLayer =
    layerMap[textElement.layer] || textElement.layer || "F.SilkS"

  const font = new TextEffectsFont()
  font.size = {
    width: textElement.font_size || 1,
    height: textElement.font_size || 1,
  }
  font.thickness = 0.15
  const textEffects = new TextEffects({ font })
  const justify = createPcbTextJustify({
    anchorAlignment: textElement.anchor_alignment,
    kicadLayer,
    // Fabrication notes retain the existing readable, unmirrored convention.
    isMirrored: isFabricationNote ? false : textElement.is_mirrored,
  })
  if (justify) {
    textEffects.justify = justify
  }

  // Handle rotation - circuit JSON uses ccw_rotation in degrees
  const rotation = textElement.ccw_rotation || 0

  // Create a footprint text element with relative position
  return new FpText({
    type: "user",
    text: textElement.text,
    position: {
      x: relativePosition.x,
      y: relativePosition.y,
      angle: rotation,
    },
    layer: kicadLayer,
    effects: textEffects,
  })
}
