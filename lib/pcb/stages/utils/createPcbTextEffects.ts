import { TextEffects, TextEffectsFont } from "kicadts"

const DEFAULT_PCB_TEXT_SIZE = 1
const DEFAULT_PCB_TEXT_THICKNESS = 0.15

export function createPcbTextEffects(fontSize = DEFAULT_PCB_TEXT_SIZE) {
  const font = new TextEffectsFont()
  font.size = { width: fontSize, height: fontSize }
  font.thickness = DEFAULT_PCB_TEXT_THICKNESS

  return new TextEffects({ font })
}
