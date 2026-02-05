import type { PcbSmtPad } from "circuit-json"
import type { FpPad } from "kicadts"
import type { PcbNetInfo } from "../../../types"
import { createSmdPadFromCircuitJson } from "../utils/CreateSmdPadFromCircuitJson"

export function convertSmdPads(
  pcbPads: PcbSmtPad[],
  componentCenter: { x: number; y: number },
  componentRotation: number,
  componentId: string,
  startPadNumber: number,
  getNetInfo: (pcbPortId?: string) => PcbNetInfo | undefined,
): { pads: FpPad[]; nextPadNumber: number } {
  const pads: FpPad[] = []
  let padNumber = startPadNumber

  for (const pcbPad of pcbPads) {
    const netInfo = getNetInfo(pcbPad.pcb_port_id)
    const pad = createSmdPadFromCircuitJson({
      pcbPad,
      componentCenter,
      padNumber,
      componentRotation,
      netInfo,
      componentId,
    })
    pads.push(pad)
    padNumber++
  }

  return { pads, nextPadNumber: padNumber }
}
