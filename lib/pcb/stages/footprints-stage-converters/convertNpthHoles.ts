import type { PcbHole } from "circuit-json"
import type { FpPad } from "kicadts"
import { createNpthPadFromCircuitJson } from "../utils/CreateNpthPadFromCircuitJson"

export function convertNpthHoles(
  pcbHoles: PcbHole[],
  componentCenter: { x: number; y: number },
  componentRotation: number,
): FpPad[] {
  const pads: FpPad[] = []

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
