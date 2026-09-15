import {
  EmbeddedFile,
  EmbeddedFileData,
  EmbeddedFileType,
  EmbeddedFiles,
  EmbeddedFonts,
  type Footprint,
  type KicadPcb,
  type SxClass,
  TextEffectsFont,
} from "kicadts"
import { alphabetFontChecksum, alphabetFontData } from "./alphabetFontData"

export const ALPHABET_FONT_FACE = "TscircuitAlphabet"
const FONT_FILENAME = "TscircuitAlphabet.ttf"

export function getAlphabetFontFace(font: string | undefined) {
  return !font || font === "tscircuit2024" ? ALPHABET_FONT_FACE : undefined
}

// kicadts' generic data writer quotes strings. KiCad embedded file data must
// instead be unquoted base64 between vertical bars, wrapped at 76 columns.
class AlphabetFontData extends EmbeddedFileData {
  override getString(): string {
    return `(data |${alphabetFontData.match(/.{1,76}/g)!.join("\n")}|)`
  }
}

class AlphabetFontType extends EmbeddedFileType {
  override getString(): string {
    return "(type font)"
  }
}

function usesAlphabetFont(node: SxClass): boolean {
  if (node instanceof TextEffectsFont && node.face === ALPHABET_FONT_FACE) {
    return true
  }
  return node.getChildren().some(usesAlphabetFont)
}

/** Embed one font per board, or per standalone library footprint. */
export function embedAlphabetFont(document: KicadPcb | Footprint): void {
  if (!usesAlphabetFont(document)) return

  const files = document.embeddedFiles?.files ?? []
  const fontFile = new EmbeddedFile({
    name: FONT_FILENAME,
    type: new AlphabetFontType("font"),
    checksum: alphabetFontChecksum,
    data: new AlphabetFontData([alphabetFontData]),
  })
  // Restore the KiCad-specific serialization after a kicadts parse/modify pass.
  const existingIndex = files.findIndex((file) => file.name === FONT_FILENAME)
  if (existingIndex === -1) files.push(fontFile)
  else files[existingIndex] = fontFile
  document.embeddedFiles = new EmbeddedFiles({ files })
  document.embeddedFonts = new EmbeddedFonts(true)
}
