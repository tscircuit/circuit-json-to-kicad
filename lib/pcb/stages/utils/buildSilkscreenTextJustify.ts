import type { PcbSilkscreenText } from "circuit-json"
import { TextEffectsJustify } from "kicadts"

export function buildSilkscreenTextJustify(
  textElement: PcbSilkscreenText,
  kicadLayer: string,
): TextEffectsJustify | undefined {
  const justify = new TextEffectsJustify()
  const anchorAlignment = textElement.anchor_alignment || "center"

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
      break
  }

  const explicitMirror = (
    textElement as PcbSilkscreenText & { is_mirrored?: boolean }
  ).is_mirrored
  const shouldMirror =
    explicitMirror != null ? explicitMirror : kicadLayer.startsWith("B.")

  if (shouldMirror) {
    justify.mirror = true
  }

  if (anchorAlignment !== "center" || shouldMirror) {
    return justify
  }

  return undefined
}
