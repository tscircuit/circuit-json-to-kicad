import type { PcbSmtPad } from "circuit-json"
import type { FootprintPad } from "kicadts"
import type { PcbNetInfo } from "../../../types"
import { createSmdPadFromCircuitJson } from "../utils/CreateSmdPadFromCircuitJson"

export function convertSmdPads(
  pcbPads: PcbSmtPad[],
  componentCenter: { x: number; y: number },
  componentRotation: number,
  componentId: string,
  startPadNumber: number,
  getNetInfo: (pcbPortId?: string) => PcbNetInfo | undefined,
  getPadNumber?: (pad: PcbSmtPad, fallback: number) => string,
): { pads: FootprintPad[]; nextPadNumber: number } {
  const pads: FootprintPad[] = []
  let padNumber = startPadNumber

  for (const pcbPad of pcbPads) {
    const netInfo = getNetInfo(pcbPad.pcb_port_id)
    const resolvedPadNumber = getPadNumber
      ? getPadNumber(pcbPad, padNumber)
      : String(padNumber)
    const pad = createSmdPadFromCircuitJson({
      pcbPad,
      componentCenter,
      padNumber: resolvedPadNumber,
      componentRotation,
      netInfo,
      componentId,
    })
    pads.push(pad)
    padNumber++
  }

  return { pads, nextPadNumber: padNumber }
}
