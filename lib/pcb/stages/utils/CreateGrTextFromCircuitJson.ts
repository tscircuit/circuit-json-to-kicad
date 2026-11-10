import type { PcbCopperText, PcbSilkscreenText } from "circuit-json"
import { GrText, TextEffects, TextEffectsFont, At } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { getKicadLayer } from "../../utils/layerMapping"
import { generateDeterministicUuid } from "./generateDeterministicUuid"
import { createPcbTextJustify } from "./CreatePcbTextJustify"

/**
 * Creates a KiCad gr_text (graphics text) element from a circuit JSON pcb_silkscreen_text or pcb_copper_text
 * This is used for standalone text elements that are not associated with components
 */
export function createGrTextFromCircuitJson({
  textElement,
  c2kMatPcb,
}: {
  textElement: PcbSilkscreenText | PcbCopperText
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

  // Map circuit JSON layer names to KiCad layer names
  const layerMap: Record<string, string> = {
    top: "F.SilkS",
    bottom: "B.SilkS",
  }
  const kicadLayer =
    textElement.type === "pcb_copper_text"
      ? getKicadLayer(textElement.layer)
      : layerMap[textElement.layer] || textElement.layer || "F.SilkS"
  const kicadLayerNames = textElement.is_knockout
    ? [kicadLayer, "knockout"]
    : kicadLayer

  const font = new TextEffectsFont()
  const fontSize = textElement.font_size || 1
  font.size = {
    width: fontSize,
    height: fontSize,
  }
  font.thickness = fontSize > 1 ? Math.min(0.3, fontSize * 0.2) : 0.15
  const textEffects = new TextEffects({ font })

  const justify = createPcbTextJustify({
    anchorAlignment: textElement.anchor_alignment,
    kicadLayer,
    isMirrored: textElement.is_mirrored,
  })

  if (justify) {
    textEffects.justify = justify
  }

  // Handle rotation - circuit JSON uses ccw_rotation in degrees
  const rotation = textElement.ccw_rotation || 0

  // Create position object (At constructor expects an array: [x, y, angle])
  const position = new At([transformedPos.x, transformedPos.y, rotation])

  const textId =
    textElement.type === "pcb_copper_text"
      ? textElement.pcb_copper_text_id
      : textElement.pcb_silkscreen_text_id

  // Create a graphics text element
  const grText = new GrText({
    text: textElement.text,
    layer: kicadLayerNames,
    effects: textEffects,
    uuid: generateDeterministicUuid(textId ?? textElement.text),
  })
  grText.position = position

  return grText
}
