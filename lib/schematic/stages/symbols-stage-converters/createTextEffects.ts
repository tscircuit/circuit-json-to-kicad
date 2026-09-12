import { TextEffects } from "kicadts"
import { createCircuitJsonTextFont } from "../../../utils/create-circuit-json-text-font"

export function createTextEffects(
  size: number,
  hide: boolean,
  text = "",
): TextEffects {
  return new TextEffects({
    font: createCircuitJsonTextFont({ text, font_size: size }),
    hiddenText: hide,
  })
}
