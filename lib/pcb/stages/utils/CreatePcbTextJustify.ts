import type { NinePointAnchor } from "circuit-json"
import { TextEffectsJustify } from "kicadts"

export function createPcbTextJustify({
  anchorAlignment = "center",
  kicadLayer,
  isMirrored,
}: {
  anchorAlignment?: NinePointAnchor
  kicadLayer: string
  isMirrored?: boolean
}): TextEffectsJustify | undefined {
  const justify = new TextEffectsJustify()

  switch (anchorAlignment) {
    case "top_center":
      justify.vertical = "top"
      break
    case "top_left":
      justify.horizontal = "left"
      justify.vertical = "top"
      break
    case "top_right":
      justify.horizontal = "right"
      justify.vertical = "top"
      break
    case "center_left":
      justify.horizontal = "left"
      break
    case "center":
      break
    case "center_right":
      justify.horizontal = "right"
      break
    case "bottom_center":
      justify.vertical = "bottom"
      break
    case "bottom_left":
      justify.horizontal = "left"
      justify.vertical = "bottom"
      break
    case "bottom_right":
      justify.horizontal = "right"
      justify.vertical = "bottom"
      break
  }

  // Honor explicit mirroring when provided; otherwise follow KiCad's
  // bottom-layer text convention.
  const shouldMirror = isMirrored ?? kicadLayer.startsWith("B.")
  if (shouldMirror) {
    justify.mirror = true
  }

  if (!justify.horizontal && !justify.vertical && !justify.mirror) {
    return undefined
  }

  return justify
}
