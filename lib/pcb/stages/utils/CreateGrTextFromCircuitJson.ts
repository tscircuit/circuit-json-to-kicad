import type { PcbSilkscreenText } from "circuit-json"
import { GrText, TextEffects, TextEffectsFont } from "kicadts"
import type { Matrix } from "transformation-matrix"
import { applyToPoint } from "transformation-matrix"

/**
 * Creates a KiCad gr_text (graphics text) element from a circuit JSON pcb_silkscreen_text
 */
export function createGrTextFromCircuitJson({
  textElement,
  transformationMatrix,
}: {
  textElement: PcbSilkscreenText
  transformationMatrix: Matrix
}): GrText | null {
  if (!textElement.text || !textElement.anchor_position) {
    return null
  }

  // Transform position to KiCad coordinates
  const transformedPosition = applyToPoint(transformationMatrix, {
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
  const fontSize = (textElement.font_size || 1) / 2
  const font = new TextEffectsFont()
  font.size = { width: fontSize, height: fontSize }
  const textEffects = new TextEffects({
    font: font,
  })

  // Handle rotation - circuit JSON uses ccw_rotation in degrees
  const rotation = textElement.ccw_rotation || 0

  // Create a graphics text element
  return new GrText({
    text: textElement.text,
    position: {
      x: transformedPosition.x,
      y: transformedPosition.y,
      angle: rotation,
    },
    layer: kicadLayer,
    effects: textEffects,
  })
}
