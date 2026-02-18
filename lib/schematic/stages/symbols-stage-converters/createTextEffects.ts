import { TextEffects, TextEffectsFont } from "kicadts"

export function createTextEffects(size: number, hide: boolean): TextEffects {
  const font = new TextEffectsFont()
  font.size = { height: size, width: size }

  return new TextEffects({
    font: font,
    hiddenText: hide,
  })
}
