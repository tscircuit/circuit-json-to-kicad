import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { PcbTrace } from "circuit-json"

/**
 * Returns true for copper traces owned by a footprint (such as pre-bridged
 * solder jumper links) rather than routed board nets.
 */
export function isFootprintBridgeTrace(
  trace: PcbTrace,
  db: CircuitJsonUtilObjects,
): boolean {
  if (!trace.pcb_component_id) return false
  if (trace.source_trace_id) return false
  if (
    "subcircuit_connectivity_map_key" in trace &&
    Boolean(trace.subcircuit_connectivity_map_key)
  ) {
    return false
  }
  return Boolean(db.pcb_component?.get(trace.pcb_component_id))
}
