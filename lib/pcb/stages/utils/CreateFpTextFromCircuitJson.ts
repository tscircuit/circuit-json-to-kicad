import type { PcbSilkscreenText } from "circuit-json"
import { FpText, TextEffects, TextEffectsFont } from "kicadts"

/**
 * Creates a KiCad fp_text (footprint text) element from a circuit JSON pcb_silkscreen_text
 */
export function createFpTextFromCircuitJson({
  textElement,
  componentCenter,
}: {
  textElement: PcbSilkscreenText
  componentCenter: { x: number; y: number }
}): FpText | null {
  if (!textElement.text || !textElement.anchor_position) {
    return null
  }

  // Calculate position relative to component center
  // FpText positions are relative to the footprint origin
  const relativePosition = {
    x: textElement.anchor_position.x - componentCenter.x,
    y: -(textElement.anchor_position.y - componentCenter.y),
  }

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
