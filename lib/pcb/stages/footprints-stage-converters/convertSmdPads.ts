import { getPhysicalPinName } from "../../../utils/getPhysicalPinName"
import type { PcbSmtPad } from "circuit-json"
import type { FootprintPad } from "kicadts"
import type { ConverterContext, PcbNetInfo } from "../../../types"
import { createSmdPadFromCircuitJson } from "../utils/CreateSmdPadFromCircuitJson"

export function convertSmdPads(
  {
    pcbPads,
    componentCenter,
    componentRotation,
    componentId,
    startPadNumber,
    getNetInfo,
  }: {
    pcbPads: PcbSmtPad[]
    componentCenter: { x: number; y: number }
    componentRotation: number
    componentId: string
    startPadNumber: number
    getNetInfo: (pcbPortId?: string) => PcbNetInfo | undefined
  },
  ctx: ConverterContext,
): { pads: FootprintPad[]; nextPadNumber: number } {
  const pads: FootprintPad[] = []
  let padNumber = startPadNumber

  for (const pcbPad of pcbPads) {
    const netInfo = getNetInfo(pcbPad.pcb_port_id)

    // Prefer a physical name confirmed by the pad, then preserve numeric
    // source identity (issue #212) before falling back to hints or order.
    const pcbPort = pcbPad.pcb_port_id
      ? ctx.db.pcb_port?.get(pcbPad.pcb_port_id)
      : undefined
    const sourcePort = pcbPort?.source_port_id
      ? ctx.db.source_port?.get(pcbPort.source_port_id)
      : undefined
    const pinHint = pcbPad.port_hints?.find((h) =>
      /^pin[A-Za-z0-9_]+$/i.test(h),
    )
    const gridHint = pcbPad.port_hints?.find((h) =>
      /^[A-Za-z]*\d+[A-Za-z0-9_]*$/.test(h),
    )
    const resolvedPadNumber =
      getPhysicalPinName(sourcePort, pcbPad.port_hints) ??
      (sourcePort?.pin_number != null
        ? String(sourcePort.pin_number)
        : pinHint
          ? pinHint.replace(/^pin/i, "")
          : (gridHint ?? String(padNumber)))

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
