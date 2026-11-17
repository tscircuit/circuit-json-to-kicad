import { getPhysicalPinName } from "../../../utils/getPhysicalPinName"
import type { PcbPlatedHole } from "circuit-json"
import type { FootprintPad } from "kicadts"
import type { ConverterContext, PcbNetInfo } from "../../../types"
import { createThruHolePadFromCircuitJson } from "../utils/CreateThruHolePadFromCircuitJson"

export function convertPlatedHoles(
  {
    platedHoles,
    componentCenter,
    componentRotation,
    componentId,
    startPadNumber,
    getNetInfo,
  }: {
    platedHoles: PcbPlatedHole[]
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

  for (const platedHole of platedHoles) {
    const netInfo = getNetInfo(platedHole.pcb_port_id)

    // Prefer a physical name confirmed by the pad, then preserve numeric
    // source identity (issue #212) before falling back to hints or order.
    const pcbPort = platedHole.pcb_port_id
      ? ctx.db.pcb_port?.get(platedHole.pcb_port_id)
      : undefined
    const sourcePort = pcbPort?.source_port_id
      ? ctx.db.source_port?.get(pcbPort.source_port_id)
      : undefined
    const pinHint = platedHole.port_hints?.find((h) =>
      /^pin[A-Za-z0-9_]+$/i.test(h),
    )
    const gridHint = platedHole.port_hints?.find((h) =>
      /^[A-Za-z]*\d+[A-Za-z0-9_]*$/.test(h),
    )
    const resolvedPadNumber =
      getPhysicalPinName(sourcePort, platedHole.port_hints) ??
      (sourcePort?.pin_number != null
        ? String(sourcePort.pin_number)
        : pinHint
          ? pinHint.replace(/^pin/i, "")
          : (gridHint ?? String(padNumber)))

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
