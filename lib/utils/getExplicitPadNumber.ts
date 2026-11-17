import type { CircuitJson, PcbPlatedHole, PcbSmtPad } from "circuit-json"
import type { ConverterContext } from "../types"

export function getExplicitPadNumber(
  pad: PcbSmtPad | PcbPlatedHole,
): string | undefined {
  // Accept explicitly authored IDs from producers that support the field.
  // Circuit JSON releases predating schema PR #993 do not declare it.
  if ("pad_number" in pad && typeof pad.pad_number === "string") {
    return pad.pad_number
  }
}

export function getExplicitPadNumbersBySourcePort(
  circuitJson: CircuitJson,
  db: ConverterContext["db"],
): ReadonlyMap<string, string | undefined> {
  const numbers = new Map<string, string | undefined>()
  for (const pad of circuitJson) {
    if (pad.type !== "pcb_smtpad" && pad.type !== "pcb_plated_hole") continue
    const number = getExplicitPadNumber(pad)
    if (!number || !pad.pcb_port_id) continue
    const sourcePortId = db.pcb_port.get(pad.pcb_port_id)?.source_port_id
    if (!sourcePortId) continue

    // A single schematic pin cannot represent conflicting physical IDs.
    if (!numbers.has(sourcePortId)) numbers.set(sourcePortId, number)
    else if (numbers.get(sourcePortId) !== number) {
      numbers.set(sourcePortId, undefined)
    }
  }
  return numbers
}
