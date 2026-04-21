import type { PcbPlatedHole } from "circuit-json"
import type { FootprintPad } from "kicadts"
import type { PcbNetInfo } from "../../../types"
import { createThruHolePadFromCircuitJson } from "../utils/CreateThruHolePadFromCircuitJson"

export function convertPlatedHoles(
  platedHoles: PcbPlatedHole[],
  componentCenter: { x: number; y: number },
  componentRotation: number,
  componentId: string,
  startPadNumber: number,
  getNetInfo: (pcbPortId?: string) => PcbNetInfo | undefined,
  getPadNumber?: (pad: PcbPlatedHole, fallback: number) => string,
): { pads: FootprintPad[]; nextPadNumber: number } {
  const pads: FootprintPad[] = []
  let padNumber = startPadNumber

  for (const platedHole of platedHoles) {
    const netInfo = getNetInfo(platedHole.pcb_port_id)
    const resolvedPadNumber = getPadNumber
      ? getPadNumber(platedHole, padNumber)
      : String(padNumber)
    const pad = createThruHolePadFromCircuitJson({
      platedHole,
      componentCenter,
      padNumber: resolvedPadNumber,
      componentRotation,
      netInfo,
      componentId,
    })
    if (pad) {
      pads.push(pad)
      padNumber++
    }
  }

  return { pads, nextPadNumber: padNumber }
}
