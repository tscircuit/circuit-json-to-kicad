import type { PcbSilkscreenText } from "circuit-json"
import { TextEffectsFont } from "kicadts"
import { kicadStrokeFontAdvances as advanceRuns } from "./kicad-stroke-font-advances"

// Measured with KiCad 10.0.0 by scripts/measure-kicad-stroke-font.py.
// Each run is [inclusive final codepoint, advance in 1/21-em units]. KiCad's
// stroke font covers the BMP; unavailable glyphs use the '?' advance (18).
function getAdvance(character: string): number {
  const codepoint = character.codePointAt(0)!
  if (codepoint < 32 || codepoint > 0xffff) return 18 / 21
  let low = 0
  let high = advanceRuns.length - 1
  while (low < high) {
    const middle = (low + high) >>> 1
    if (codepoint <= advanceRuns[middle]![0]!) high = middle
    else low = middle + 1
  }
  return advanceRuns[low]![1]! / 21
}

function getLineAdvance(line: string): number {
  let advance = 0
  let column = 0
  for (const character of line) {
    if (character === "\t") {
      // KiCad locks tabs to the next fourth native em column, rather than
      // adding a fixed number of spaces to the current cursor position.
      column = (Math.floor(column / 4) + 1) * 4 - 1
      let next = column + getAdvance(" ")
      while (next <= advance) {
        column += 4
        next += 4
      }
      advance = next
    } else {
      advance += getAdvance(character)
    }
    column++
  }
  return advance
}

/**
 * Keep editable native KiCad text at the requested height, fitting its width
 * to the source's 0.6-em-per-character allocation. This is not glyph-identical
 * to the SVG's Arial/sans-serif font. See README's silkscreen text section.
 */
export function createSilkscreenTextFont(
  textElement: PcbSilkscreenText,
): TextEffectsFont {
  const height = textElement.font_size || 1
  // Do not give tiny labels the same heavy 0.15 mm stroke as large labels.
  const baseStroke = Math.min(0.1, height / 10)
  // A tab occupies four source columns; native tab stops are measured below.
  const lines = textElement.text.split("\n")
  const columns = Math.max(
    ...lines.map((line) => Array.from(line.replaceAll("\t", "    ")).length),
  )
  const advance = Math.max(...lines.map(getLineAdvance))
  const targetWidth = columns * height * 0.6
  let width = height
  // KiCad 10's unrotated stroke-text box is (advance - 0.2) * size.x
  // + 3 * effectiveStroke. Reserve that stroke before fitting, including for
  // short labels; simply multiplying size.x by 0.6 misses these margins.
  if (columns > 0 && advance > 0.2) {
    width = Math.min(height, (targetWidth - 3 * baseStroke) / (advance - 0.2))
    // KiCad clamps the effective stroke to one quarter of the smaller size
    // axis. Solve that branch too, instead of emitting a stroke it will clamp.
    if (width < 4 * baseStroke) {
      width = Math.min(height, targetWidth / (advance - 0.2 + 3 / 4))
    }
  }
  const font = new TextEffectsFont()
  font.size = { width, height }
  font.thickness = Math.min(baseStroke, width / 4)
  return font
}
