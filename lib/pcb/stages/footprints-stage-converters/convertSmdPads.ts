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

  // Build a set of smtpad IDs that have an explicit pcb_solder_paste element.
  // When the circuit JSON contains at least one pcb_solder_paste, we use that
  // information to decide per-pad whether paste should be emitted (fixes
  // fiducials and other pads that deliberately have no paste aperture).
  // If no pcb_solder_paste elements exist we fall back to always emitting
  // paste so that older circuit JSON without those elements is unaffected.
  const solderPasteList: Array<{ pcb_smtpad_id?: string }> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx.db as any).pcb_solder_paste?.list() ?? []
  const solderPasteSmtpadIds = new Set(
    solderPasteList.map((sp) => sp.pcb_smtpad_id).filter(Boolean),
  )
  const hasSolderPasteData = solderPasteSmtpadIds.size > 0

  for (const pcbPad of pcbPads) {
    const netInfo = getNetInfo(pcbPad.pcb_port_id)

    // Preserve source pin identity — not pad array index — as the KiCad pad
    // number (see issue #212). Walk pcb_port -> source_port.pin_number; fall
    // back to pin-like port_hints, then to the sequential counter.
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
      /^[A-Za-z]?\d+[A-Za-z0-9_]*$/.test(h),
    )
    const resolvedPadNumber =
      sourcePort?.pin_number != null
        ? String(sourcePort.pin_number)
        : pinHint
          ? pinHint.replace(/^pin/i, "")
          : (gridHint ?? String(padNumber))

    const includePaste =
      !hasSolderPasteData ||
      solderPasteSmtpadIds.has(pcbPad.pcb_smtpad_id ?? "")

    const pad = createSmdPadFromCircuitJson({
      pcbPad,
      componentCenter,
      padNumber: resolvedPadNumber,
      componentRotation,
      netInfo,
      componentId,
      includePaste,
    })
    pads.push(pad)
    padNumber++
  }

  return { pads, nextPadNumber: padNumber }
}
