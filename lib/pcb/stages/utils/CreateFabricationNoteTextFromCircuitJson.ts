import type { PcbFabricationNoteText, PcbNoteText } from "circuit-json"
import {
  At,
  GrText,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
} from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { generateDeterministicUuid } from "./generateDeterministicUuid"

/**
 * Creates a KiCad gr_text (graphics text) element from a circuit JSON fabrication note or standalone PCB note
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

  // Map anchor_alignment to KiCad justify
  const justify = new TextEffectsJustify()
  const anchorAlignment = textElement.anchor_alignment || "center"

  // Map circuit JSON anchor_alignment to KiCad horizontal/vertical justify
  switch (anchorAlignment) {
    case "top_left":
      justify.horizontal = "left"
      justify.vertical = "top"
      break
    case "top_right":
      justify.horizontal = "right"
      justify.vertical = "top"
      break
    case "bottom_left":
      justify.horizontal = "left"
      justify.vertical = "bottom"
      break
    case "bottom_right":
      justify.horizontal = "right"
      justify.vertical = "bottom"
      break
    case "center":
      // Default is center, no justify needed
      break
  }

  const font = new TextEffectsFont()
  font.size = {
    width: textElement.font_size || 1,
    height: textElement.font_size || 1,
  }
  font.thickness = 0.15
  const textEffects = new TextEffects({ font })

  // Only add justify if it's not center alignment
  if (anchorAlignment !== "center") {
    textEffects.justify = justify
  }

  const rotation =
    textElement.type === "pcb_fabrication_note_text"
      ? (textElement.ccw_rotation ?? 0)
      : 0

  // Create position object (At constructor expects an array: [x, y, angle])
  const position = new At([transformedPos.x, transformedPos.y, rotation])

  // Create a graphics text element
  const grText = new GrText({
    text: textElement.text,
    layer: kicadLayer,
    effects: textEffects,
    uuid: generateDeterministicUuid(
      textElement.type === "pcb_note_text"
        ? textElement.pcb_note_text_id
        : (textElement.pcb_fabrication_note_text_id ?? textElement.text),
    ),
  })
  grText.position = position

  return grText
}
