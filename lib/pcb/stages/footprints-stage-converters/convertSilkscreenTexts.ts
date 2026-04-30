import type { PcbSilkscreenText } from "circuit-json"
import { FpText } from "kicadts"
import { createFpTextFromCircuitJson } from "../utils/CreateFpTextFromCircuitJson"

export function convertSilkscreenTexts(
  silkscreenTexts: PcbSilkscreenText[],
  componentCenter: { x: number; y: number },
  componentRotation: number,
  sourceComponentName?: string,
): FpText[] {
  const fpTexts: FpText[] = []

  for (const textElement of silkscreenTexts) {
    const fpText = createFpTextFromCircuitJson({
      textElement,
      componentCenter,
      componentRotation,
    })
    if (fpText) {
      if (sourceComponentName && textElement.text === sourceComponentName) {
        fpText.type = "reference"
      }
      fpTexts.push(fpText)
    }
  }

  return fpTexts
}
