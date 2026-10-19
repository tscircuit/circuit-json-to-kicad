import type { PcbSmtPad } from "circuit-json"
import type { ConverterContext } from "../../../types"

/**
 * Whether an SMT pad gets a solder paste aperture.
 *
 * tscircuit core emits a pcb_solder_paste for every pad that gets paste, so a
 * pad needs a matching record. Circuit JSON without any solder paste records
 * (e.g. a board imported from KiCad) doesn't model paste, so uncovered pads
 * keep their paste.
 */
export function hasSolderPasteForPad(
  pcbPad: PcbSmtPad,
  ctx: ConverterContext,
): boolean {
  if (ctx.db.pcb_solder_paste.list().length === 0) {
    return !pcbPad.is_covered_with_solder_mask
  }
  return (
    ctx.db.pcb_solder_paste.list({ pcb_smtpad_id: pcbPad.pcb_smtpad_id })
      .length > 0
  )
}
