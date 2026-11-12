import type { PcbSilkscreenText } from "circuit-json"
import { FpText } from "kicadts"
import { createFpTextFromCircuitJson } from "../utils/CreateFpTextFromCircuitJson"

export function convertSilkscreenTexts(params: {
  silkscreenTexts: PcbSilkscreenText[]
  componentCenter: { x: number; y: number }
  componentRotation: number
}): FpText[] {
  const { silkscreenTexts, componentCenter, componentRotation } = params
  const fpTexts: FpText[] = []

  for (const textElement of silkscreenTexts) {
    const fpText = createFpTextFromCircuitJson({
      textElement,
      componentCenter,
      componentRotation,
    })
    if (fpText) {
      fpTexts.push(fpText)
    }
  }

  return fpTexts
}
