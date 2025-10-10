import type { PcbSilkscreenText } from "circuit-json"
import {
  GrText,
  TextEffects,
  TextEffectsFont,
  TextEffectsJustify,
  At,
} from "kicadts"
import { applyToPoint, type Matrix } from "transformation-matrix"

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

  const textEffects = new TextEffects({
    font: font,
  })

  // Only add justify if it's not center alignment
  if (anchorAlignment !== "center") {
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
  })
  grText.position = position

  return grText
}
