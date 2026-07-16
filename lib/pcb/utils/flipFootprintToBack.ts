import type { Footprint } from "kicadts"

// Front -> back layer map. Back layers (B.*) are absent so they pass through
// unchanged, which keeps the flip idempotent and leaves already-correct
// bottom-layer elements (e.g. pads emitted on B.Cu from pcbPad.layer) untouched.
const FRONT_TO_BACK: Record<string, string> = {
  "F.Cu": "B.Cu",
  "F.SilkS": "B.SilkS",
  "F.Fab": "B.Fab",
  "F.CrtYd": "B.CrtYd",
  "F.Mask": "B.Mask",
  "F.Paste": "B.Paste",
  "F.Adhes": "B.Adhes",
}

const layerName = (layer: unknown): string | undefined => {
  if (typeof layer === "string") return layer
  if (Array.isArray(layer))
    return layer[0] != null ? String(layer[0]) : undefined
  if (layer && typeof layer === "object") {
    const l = layer as { names?: string[]; getString?: () => string }
    if (Array.isArray(l.names) && l.names.length) return l.names[0]
    if (typeof l.getString === "function") return l.getString()
  }
  return undefined
}

const toBack = (layer: unknown): string | undefined => {
  const name = layerName(layer)
  if (!name) return undefined
  return FRONT_TO_BACK[name] ?? name
}

const rotate180 = (pos: unknown): void => {
  const at = pos as { angle?: number } | undefined
  if (at && typeof at === "object" && "angle" in at) {
    at.angle = ((at.angle ?? 0) + 180) % 360
  }
}

// kicadts getters return fresh arrays, so callers must reassign after mutating.
const flipItems = <T extends { layer?: unknown }>(
  items: T[] | undefined,
  positionOf?: (item: T) => unknown,
): T[] => {
  const out = items ?? []
  for (const item of out) {
    const back = toBack(item.layer)
    if (back) item.layer = back as never
    if (positionOf) rotate180(positionOf(item))
  }
  return out
}

/**
 * KiCad places a footprint on the back copper by tagging the footprint and its
 * graphics/text with B.* layers (pads carry their own B.Cu layer already, so
 * their positions are not re-mirrored). The circuit-json exporter emitted every
 * footprint on F.Cu regardless of `pcb_component.layer`, so bottom-side parts
 * came out with the wrong silk / fab / courtyard side and a top CPL rotation.
 * This moves a bottom component's footprint to the back and rotates its text
 * 180deg for readability, matching what pcbnew produces when you flip a part.
 */
export function flipFootprintToBack(footprint: Footprint): void {
  footprint.layer = "B.Cu" as never
  // Reference/Value/Footprint/Datasheet are footprint *properties* (always
  // emitted on the front) and the fp text/graphics; move them all to the back.
  footprint.properties = flipItems(footprint.properties, (p) => p.position)
  footprint.fpTexts = flipItems(footprint.fpTexts, (t) => t.position)
  footprint.fpLines = flipItems(footprint.fpLines)
  footprint.fpCircles = flipItems(footprint.fpCircles)
  footprint.fpRects = flipItems(footprint.fpRects)
  footprint.fpPolys = flipItems(footprint.fpPolys)
  footprint.fpArcs = flipItems(footprint.fpArcs)
}
