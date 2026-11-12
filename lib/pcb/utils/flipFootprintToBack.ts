import { type Footprint, TextEffects, TextEffectsJustify } from "kicadts"

const FRONT_TO_BACK: Record<string, string> = {
  "F.Cu": "B.Cu",
  "F.SilkS": "B.SilkS",
  "F.Fab": "B.Fab",
  "F.CrtYd": "B.CrtYd",
  "F.Mask": "B.Mask",
  "F.Paste": "B.Paste",
  "F.Adhes": "B.Adhes",
}

const getLayerNames = (layer: unknown): string[] | undefined => {
  if (typeof layer === "string") return [layer]
  if (Array.isArray(layer)) return layer.map((item) => String(item))
  if (layer && typeof layer === "object") {
    const l = layer as { names?: string[]; getString?: () => string }
    if (Array.isArray(l.names) && l.names.length > 0) return l.names
    if (typeof l.getString === "function") {
      const match = l.getString().match(/\(layer\s+([^)]+)\)/)
      if (match?.[1]) {
        return match[1]
          .trim()
          .split(/\s+/)
          .map((token) => token.replace(/^"|"$/g, ""))
      }
    }
  }
  return undefined
}

const toBackLayer = (layer: unknown): string | string[] | undefined => {
  const names = getLayerNames(layer)
  if (!names || names.length === 0) return undefined
  const mapped = names.map((name) => FRONT_TO_BACK[name] ?? name)
  return mapped.length === 1 ? mapped[0] : mapped
}

const ensureMirroredEffects = (item: { effects?: TextEffects }): void => {
  item.effects ??= new TextEffects()
  item.effects.justify ??= new TextEffectsJustify()
  item.effects.justify.mirror = true
}

const flipItems = <T extends { layer?: unknown }>(
  items: T[] | undefined,
  onFlipped?: (item: T, nextLayer: string | string[]) => void,
): T[] => {
  const out = items ?? []
  for (const item of out) {
    const back = toBackLayer(item.layer)
    if (back) {
      item.layer = back as never
      onFlipped?.(item, back)
    }
  }
  return out
}

/**
 * Move a bottom-side footprint and its graphics/text/properties to back layers (B.*),
 * ensuring back-side text uses mirrored justification.
 */
export function flipFootprintToBack(footprint: Footprint): void {
  footprint.layer = "B.Cu" as never
  footprint.properties = flipItems(footprint.properties)
  footprint.fpTexts = flipItems(footprint.fpTexts, (text, nextLayer) => {
    const primary = Array.isArray(nextLayer) ? nextLayer[0] : nextLayer
    if (primary?.startsWith("B.")) {
      ensureMirroredEffects(text)
    }
  })
  footprint.fpLines = flipItems(footprint.fpLines)
  footprint.fpCircles = flipItems(footprint.fpCircles)
  footprint.fpRects = flipItems(footprint.fpRects)
  footprint.fpPolys = flipItems(footprint.fpPolys)
  footprint.fpArcs = flipItems(footprint.fpArcs)
}
