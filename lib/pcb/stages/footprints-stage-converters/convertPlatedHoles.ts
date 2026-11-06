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
    usedPadNumbers = new Set<string>(),
  }: {
    platedHoles: PcbPlatedHole[]
    componentCenter: { x: number; y: number }
    componentRotation: number
    componentId: string
    startPadNumber: number
    getNetInfo: (pcbPortId?: string) => PcbNetInfo | undefined
    usedPadNumbers?: Set<string>
  },
  ctx: ConverterContext,
): { pads: FootprintPad[]; nextPadNumber: number } {
  const pads: FootprintPad[] = []
  let padNumber = startPadNumber

  for (const platedHole of platedHoles) {
    const pcbPort = platedHole.pcb_port_id
      ? ctx.db.pcb_port?.get(platedHole.pcb_port_id)
      : undefined
    const sourcePort = pcbPort?.source_port_id
      ? ctx.db.source_port?.get(pcbPort.source_port_id)
      : undefined
    const explicitPinNumber =
      getPhysicalPinName(sourcePort) ??
      (sourcePort?.pin_number != null
        ? String(sourcePort.pin_number)
        : undefined)
    if (explicitPinNumber !== undefined) {
      usedPadNumbers.add(explicitPinNumber)
    }
  }

  for (const platedHole of platedHoles) {
    const netInfo = getNetInfo(platedHole.pcb_port_id)

    // Preserve source pin identity — not pad array index — as the KiCad pad
    // number (see issue #212). Walk pcb_port -> source_port.pin_number; fall
    // back to pin-like port_hints, then to the sequential counter.
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
      /^[A-Za-z]?\d+[A-Za-z0-9_]*$/.test(h),
    )
    const explicitPinNumber =
      getPhysicalPinName(sourcePort) ??
      (sourcePort?.pin_number != null
        ? String(sourcePort.pin_number)
        : undefined)
    const hintPinNumber = pinHint ? pinHint.replace(/^pin/i, "") : gridHint

    let resolvedPadNumber: string
    if (explicitPinNumber !== undefined) {
      resolvedPadNumber = explicitPinNumber
    } else if (
      hintPinNumber !== undefined &&
      !usedPadNumbers.has(hintPinNumber)
    ) {
      resolvedPadNumber = hintPinNumber
    } else {
      while (usedPadNumbers.has(String(padNumber))) {
        padNumber++
      }
      resolvedPadNumber = String(padNumber)
    }
    usedPadNumbers.add(resolvedPadNumber)

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
