import type { PcbFabricationNoteText } from "circuit-json"
import { At, GrText, TextEffects, TextEffectsFont } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { generateDeterministicUuid } from "./generateDeterministicUuid"
import { createPcbTextJustify } from "./CreatePcbTextJustify"

/**
 * Creates a KiCad gr_text (graphics text) element from a circuit JSON pcb_fabrication_note_text
 * Fabrication notes are placed on the F.Fab or B.Fab layer for manufacturing notes
 */
export function createFabricationNoteTextFromCircuitJson({
  textElement,
  c2kMatPcb,
}: {
  textElement: PcbFabricationNoteText
  c2kMatPcb: Matrix
}): GrText | null {
  if (!textElement.text || !textElement.anchor_position) {
    return null
  }

  // Transform position to KiCad coordinates
  const transformedPos = applyToPoint(c2kMatPcb, {
    x: textElement.anchor_position.x,
    y: textElement.anchor_position.y,
  })

  // Map circuit JSON layer names to KiCad fabrication layer names
  const layerMap: Record<string, string> = {
    top: "F.Fab",
    bottom: "B.Fab",
  }
  const kicadLayer = layerMap[textElement.layer] || textElement.layer || "F.Fab"

  const justify = createPcbTextJustify({
    anchorAlignment: textElement.anchor_alignment,
    kicadLayer,
    isMirrored: false,
  })

  const font = new TextEffectsFont()
  font.size = {
    width: textElement.font_size || 1,
    height: textElement.font_size || 1,
  }
  font.thickness = 0.15
  const textEffects = new TextEffects({ font })

  if (justify) {
    textEffects.justify = justify
  }

  // Create position object (At constructor expects an array: [x, y, angle])
  const position = new At([
    transformedPos.x,
    transformedPos.y,
    textElement.ccw_rotation ?? 0,
  ])

  // Create a graphics text element
  const grText = new GrText({
    text: textElement.text,
    layer: kicadLayer,
    effects: textEffects,
    uuid: generateDeterministicUuid(
      textElement.pcb_fabrication_note_text_id ?? textElement.text,
    ),
  })
  grText.position = position

  return grText
}
