import {
  glyphAdvanceRatio,
  spaceWidthRatio,
  strokeWidthRatio,
} from "@tscircuit/alphabet"
import { TextEffectsFont } from "kicadts"

/**
 * Builds a KiCad TextEffectsFont whose metrics match the bundled
 * TscircuitAlphabet font used by the SVG preview and 3D textures.
 *
 * KiCad substitutes its own stroke font for native text, so the cell width
 * must carry the source advance (0.692052 x fontSize) instead of the font
 * size itself, and the stroke thickness must come from the font's stroke
 * ratio rather than a fixed value. Without this, exported text is ~30%
 * wider and heavier than the layout reviewed in tscircuit.
 */
export function createSilkscreenTextFont({
  text,
  fontSize,
}: {
  text: string
  fontSize: number
}): TextEffectsFont {
  // Average advance of the longest line; the bundled font is monospace so
  // this is uniform, but measure per character for safety
  const longestLine = text
    .split("\n")
    .reduce((a, b) => (b.length > a.length ? b : a), "")
  let advanceSum = 0
  for (const char of longestLine) {
    advanceSum +=
      glyphAdvanceRatio[char as keyof typeof glyphAdvanceRatio] ??
      spaceWidthRatio
  }
  const widthRatio =
    longestLine.length > 0 ? advanceSum / longestLine.length : spaceWidthRatio

  const font = new TextEffectsFont()
  font.size = {
    width: Math.round(fontSize * widthRatio * 1e6) / 1e6,
    height: fontSize,
  }
  font.thickness = Math.round(strokeWidthRatio * fontSize * 1e6) / 1e6
  return font
}
