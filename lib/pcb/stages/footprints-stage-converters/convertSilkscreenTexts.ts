import type { PcbSilkscreenText } from "circuit-json"
import { FpText, TextEffects, TextEffectsFont } from "kicadts"
import { createFpTextFromCircuitJson } from "../utils/CreateFpTextFromCircuitJson"

export function convertSilkscreenTexts(
  silkscreenTexts: PcbSilkscreenText[],
  componentCenter: { x: number; y: number },
  componentRotation: number,
  sourceComponentName?: string,
): FpText[] {
  const fpTexts: FpText[] = []
  let hasReference = false

  for (const textElement of silkscreenTexts) {
    const fpText = createFpTextFromCircuitJson({
      textElement,
      componentCenter,
      componentRotation,
    })
    if (fpText) {
      if (sourceComponentName && textElement.text === sourceComponentName) {
        fpText.type = "reference"
        hasReference = true
      }
      fpTexts.push(fpText)
    }
  }

  // If no silkscreen text matched the reference designator, create a fallback
  // fp_text reference. This ensures inline/custom footprints get a reference
  // designator in the KiCad PCB output.
  if (!hasReference && sourceComponentName) {
    const font = new TextEffectsFont()
    font.size = { width: 1, height: 1 }
    const textEffects = new TextEffects({ font })

    const refText = new FpText({
      type: "reference",
      text: sourceComponentName,
      position: { x: 0, y: -2 },
      layer: "F.SilkS",
      effects: textEffects,
    })
    fpTexts.unshift(refText)
  }

  return fpTexts
}
