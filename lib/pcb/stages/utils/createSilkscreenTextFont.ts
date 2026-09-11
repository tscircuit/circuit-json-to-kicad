import { TextEffectsFont } from "kicadts"

/** Native-text fallback: preserve proportions instead of fitting estimated widths. */
export function createSilkscreenTextFont(_text: string, fontSize = 1) {
  const size = fontSize > 0 && Number.isFinite(fontSize) ? fontSize : 1
  return Object.assign(new TextEffectsFont(), {
    size: { width: size, height: size },
    thickness: Math.min(0.15, size / 4),
  })
}
