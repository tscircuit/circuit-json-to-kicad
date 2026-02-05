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
): { pads: FootprintPad[]; nextPadNumber: number } {
  const pads: FootprintPad[] = []
  let padNumber = startPadNumber

  for (const platedHole of platedHoles) {
    const netInfo = getNetInfo(platedHole.pcb_port_id)
    const pad = createThruHolePadFromCircuitJson({
      platedHole,
      componentCenter,
      padNumber,
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
