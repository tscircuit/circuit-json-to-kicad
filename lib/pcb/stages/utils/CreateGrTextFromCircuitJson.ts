import type { PcbSilkscreenText } from "circuit-json"
import { GrText, TextEffects, TextEffectsFont, At } from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"
import { generateDeterministicUuid } from "./generateDeterministicUuid"
import { buildSilkscreenTextJustify } from "./buildSilkscreenTextJustify"

/**
 * Creates a KiCad gr_text (graphics text) element from a circuit JSON pcb_silkscreen_text
 * This is used for standalone text elements that are not associated with components
 */
export function createGrTextFromCircuitJson({
  textElement,
  c2kMatPcb,
}: {
  textElement: PcbSilkscreenText
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
    layerMap[textElement.layer] || textElement.layer || "F.SilkS"

  // Create text effects with font size (scaled to half for KiCad)
  const fontSize = (textElement.font_size || 1) / 1.5
  const font = new TextEffectsFont()
  font.size = { width: fontSize, height: fontSize }

  const textEffects = new TextEffects({
    font: font,
  })

  const justify = buildSilkscreenTextJustify(textElement, kicadLayer)
  if (justify) {
    textEffects.justify = justify
  }

  // Handle rotation - circuit JSON uses ccw_rotation in degrees
  const rotation = textElement.ccw_rotation || 0

  // Create position object (At constructor expects an array: [x, y, angle])
  const position = new At([transformedPos.x, transformedPos.y, rotation])

  // Create a graphics text element
  const grText = new GrText({
    text: textElement.text,
    layer: kicadLayer,
    effects: textEffects,
    uuid: generateDeterministicUuid(
      textElement.pcb_silkscreen_text_id ?? textElement.text,
    ),
  })
  grText.position = position

  return grText
}
