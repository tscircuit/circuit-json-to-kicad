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
 * Move a bottom-side footprint's graphics/text onto B.* layers.
 *
 * AddFootprintsStage already tags the footprint itself as B.Cu and pads already
 * carry B.Cu from pcbPad.layer. Custom-footprint silk/fab/courtyard, and the
 * Reference/Value properties, still often arrive on F.* because the circuit-json
 * element has no layer (defaults to top). Flip those children and rotate text
 * 180deg, matching what pcbnew produces when you Flip() a part.
 */
export function flipFootprintToBack(footprint: Footprint): void {
  footprint.layer = "B.Cu" as never
  footprint.properties = flipItems(footprint.properties, (p) => p.position)
  footprint.fpTexts = flipItems(footprint.fpTexts, (t) => t.position)
  footprint.fpLines = flipItems(footprint.fpLines)
  footprint.fpCircles = flipItems(footprint.fpCircles)
  footprint.fpRects = flipItems(footprint.fpRects)
  footprint.fpPolys = flipItems(footprint.fpPolys)
  footprint.fpArcs = flipItems(footprint.fpArcs)
}
