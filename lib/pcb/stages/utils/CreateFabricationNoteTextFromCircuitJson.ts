import { createCircuitJsonTextFont } from "../../../utils/create-circuit-json-text-font"
import { createPcbTextJustify } from "./CreatePcbTextJustify"
import type { PcbFabricationNoteText, PcbNoteText } from "circuit-json"
import { At, GrText, TextEffects } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

/**
 * Creates a KiCad gr_text (graphics text) element from a circuit JSON pcb_fabrication_note_text
 * Fabrication notes are placed on the F.Fab or B.Fab layer for manufacturing notes
 */
export function createFabricationNoteTextFromCircuitJson({
  textElement,
  c2kMatPcb,
}: {
  textElement: PcbFabricationNoteText | PcbNoteText
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

  const font = createCircuitJsonTextFont(textElement)
  const justify = createPcbTextJustify({
    anchorAlignment: textElement.anchor_alignment,
    kicadLayer,
    isMirrored:
      "is_mirrored_from_top_view" in textElement
        ? textElement.is_mirrored_from_top_view
        : undefined,
  })
  const textEffects = new TextEffects({ font, justify })
  const position = new At([
    transformedPos.x,
    transformedPos.y,
    "ccw_rotation" in textElement ? (textElement.ccw_rotation ?? 0) : 0,
  ])

  // Create a graphics text element
  const grText = new GrText({
    text: textElement.text,
    layer: kicadLayer,
    effects: textEffects,
    uuid: generateDeterministicUuid(
      textElement.type === "pcb_fabrication_note_text"
        ? textElement.pcb_fabrication_note_text_id
        : textElement.pcb_note_text_id,
    ),
  })
  grText.position = position

  return grText
}
