import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"

/**
 * Resolves the KiCad pad number from a circuit-json pad by following its
 * source pin identity (pcb_port -> source_port.pin_number), falling back to
 * pin-like port_hints, and finally to a sequential number.
 *
 * Pad array order is NOT the physical pin number — this preserves the
 * identity declared on the original `<smtpad portHints={["pin4"]} ... />`.
 */
export function getKiCadPadNumber(
  pad: { pcb_port_id?: string; port_hints?: string[] },
  db: CircuitJsonUtilObjects,
  fallbackNumber: number,
): string {
  const pcbPort = pad.pcb_port_id
    ? db.pcb_port?.get(pad.pcb_port_id)
    : undefined

  const sourcePortId = pcbPort?.source_port_id
  const sourcePort = sourcePortId
    ? db.source_port?.get(sourcePortId)
    : undefined

  if (sourcePort?.pin_number != null) {
    return String(sourcePort.pin_number)
  }

  const pinHint = pad.port_hints?.find((h) => /^pin[A-Za-z0-9_]+$/i.test(h))
  if (pinHint) return pinHint.replace(/^pin/i, "")

  const gridHint = pad.port_hints?.find((h) =>
    /^[A-Za-z]?\d+[A-Za-z0-9_]*$/.test(h),
  )
  if (gridHint) return gridHint

  return String(fallbackNumber)
}
