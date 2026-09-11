import { TextEffectsFont } from "kicadts"

// Printable ASCII advances in 1/21-em units, measured with KiCad 10's
// PCB_TEXT bounding boxes (the difference between two and one copies).
// Keeping metrics here avoids requiring a KiCad installation during export.
const ASCII_ADVANCES = [
  16, 10, 16, 21, 20, 24, 26, 10, 14, 14, 16, 26, 10, 26, 10, 22, 20, 20, 20,
  20, 20, 20, 20, 20, 20, 20, 10, 10, 26, 26, 26, 18, 27, 18, 21, 21, 21, 19,
  18, 21, 22, 10, 16, 21, 17, 24, 22, 22, 21, 22, 21, 20, 16, 22, 18, 24, 20,
  18, 20, 14, 14, 14, 12, 16, 8, 19, 19, 18, 19, 18, 12, 19, 19, 10, 10, 17, 11,
  28, 19, 19, 19, 19, 13, 17, 12, 19, 16, 22, 17, 16, 17, 14, 20, 14, 15,
]

export function createSilkscreenTextFont(text: string, fontSize = 1) {
  const height = fontSize > 0 && Number.isFinite(fontSize) ? fontSize : 1
  const thickness = height / 8
  let width = height

  // KiCad markup, variables, tabs and non-ASCII glyphs need their own layout
  // metrics. Preserve their native sizing rather than guessing their widths.
  if (/^[\x20-\x7e\n]*$/.test(text) && !/[~^_$]\{/.test(text)) {
    for (const line of text.split("\n")) {
      if (!line.length) continue
      const advance =
        [...line].reduce(
          (sum, char) => sum + ASCII_ADVANCES[char.charCodeAt(0) - 32]!,
          0,
        ) / 21
      // KiCad's bounding box removes 0.2 em of trailing spacing and adds
      // three pen widths. Fit each line to the source's estimated allocation.
      const targetWidth = line.length * height * 0.6
      width = Math.min(width, (targetWidth - 3 * thickness) / (advance - 0.2))
    }
  }

  return Object.assign(new TextEffectsFont(), {
    size: { width, height },
    thickness,
  })
}
