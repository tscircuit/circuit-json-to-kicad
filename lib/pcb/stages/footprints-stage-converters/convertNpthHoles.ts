import type { PcbHole } from "circuit-json"
import type { FootprintPad } from "kicadts"
import { createNpthPadFromCircuitJson } from "../utils/CreateNpthPadFromCircuitJson"

export function convertNpthHoles(
  pcbHoles: PcbHole[],
  componentCenter: { x: number; y: number },
  componentRotation: number,
): FootprintPad[] {
  const pads: FootprintPad[] = []

  for (const pcbHole of pcbHoles) {
    const pad = createNpthPadFromCircuitJson({
      pcbHole,
      componentCenter,
      componentRotation,
    })
    if (pad) {
      pads.push(pad)
    }
  }

  return pads
}
