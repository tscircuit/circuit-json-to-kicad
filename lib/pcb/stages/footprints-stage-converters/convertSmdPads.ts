import { getPhysicalPinName } from "../../../utils/getPhysicalPinName"
import type { PcbSmtPad } from "circuit-json"
import type { FootprintPad } from "kicadts"
import type { ConverterContext, PcbNetInfo } from "../../../types"
import { createSmdPadFromCircuitJson } from "../utils/CreateSmdPadFromCircuitJson"

export function collectExplicitPadNumbers(
  items: Array<{ pcb_port_id?: string }>,
  ctx: ConverterContext,
  target: Set<string> = new Set(),
): Set<string> {
  for (const item of items) {
    const pcbPort = item.pcb_port_id
      ? ctx.db.pcb_port?.get(item.pcb_port_id)
      : undefined
    const sourcePort = pcbPort?.source_port_id
      ? ctx.db.source_port?.get(pcbPort.source_port_id)
      : undefined
    const explicitPadNumber =
      getPhysicalPinName(sourcePort) ??
      (sourcePort?.pin_number != null
        ? String(sourcePort.pin_number)
        : undefined)
    if (explicitPadNumber !== undefined) {
      target.add(explicitPadNumber)
    }
  }
  return target
}

export function convertSmdPads(
  {
    pcbPads,
    componentCenter,
    componentRotation,
    componentId,
    startPadNumber,
    getNetInfo,
    usedPadNumbers: providedUsedPadNumbers,
  }: {
    pcbPads: PcbSmtPad[]
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
  const usedPadNumbers =
    providedUsedPadNumbers ?? collectExplicitPadNumbers(pcbPads, ctx)

  for (const pcbPad of pcbPads) {
    const netInfo = getNetInfo(pcbPad.pcb_port_id)

    // Preserve source pin identity — not pad array index — as the KiCad pad
    // number (see issue #212). Walk pcb_port -> source_port.pin_number; fall
    // back to pin-like port_hints (only if not already claimed within this
    // footprint, see issue #535), then to the next unused sequential counter.
    const pcbPort = pcbPad.pcb_port_id
      ? ctx.db.pcb_port?.get(pcbPad.pcb_port_id)
      : undefined
    const sourcePort = pcbPort?.source_port_id
      ? ctx.db.source_port?.get(pcbPort.source_port_id)
      : undefined
    const explicitPadNumber =
      getPhysicalPinName(sourcePort) ??
      (sourcePort?.pin_number != null
        ? String(sourcePort.pin_number)
        : undefined)

    let resolvedPadNumber: string
    if (explicitPadNumber !== undefined) {
      resolvedPadNumber = explicitPadNumber
    } else {
      const pinHint = pcbPad.port_hints?.find((h) =>
        /^pin[A-Za-z0-9_]+$/i.test(h),
      )
      const gridHint = pcbPad.port_hints?.find((h) =>
        /^[A-Za-z]?\d+[A-Za-z0-9_]*$/.test(h),
      )
      const hintCandidate = pinHint ? pinHint.replace(/^pin/i, "") : gridHint
      if (hintCandidate !== undefined && !usedPadNumbers.has(hintCandidate)) {
        resolvedPadNumber = hintCandidate
      } else {
        while (usedPadNumbers.has(String(padNumber))) {
          padNumber++
        }
        resolvedPadNumber = String(padNumber)
      }
    }
    usedPadNumbers.add(resolvedPadNumber)

    const pad = createSmdPadFromCircuitJson({
      pcbPad,
      hasSolderPaste: ctx.db.pcb_solder_paste
        .list()
        .some((paste) => paste.pcb_smtpad_id === pcbPad.pcb_smtpad_id),
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
