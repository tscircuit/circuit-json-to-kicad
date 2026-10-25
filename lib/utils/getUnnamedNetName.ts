import type { CircuitJsonUtilObjects } from "@tscircuit/circuit-json-util"
import type { SourceTrace } from "circuit-json"

/** Connectivity key of the net a source trace belongs to. */
export function getSourceTraceConnectivityKey(
  db: CircuitJsonUtilObjects,
  sourceTrace: SourceTrace,
): string | undefined {
  if (sourceTrace.subcircuit_connectivity_map_key) {
    return sourceTrace.subcircuit_connectivity_map_key
  }
  for (const sourceNetId of sourceTrace.connected_source_net_ids ?? []) {
    const key = db.source_net?.get(sourceNetId)?.subcircuit_connectivity_map_key
    if (key) return key
  }
  return undefined
}

/**
 * KiCad-safe name for a net that only exists as a trace. The schematic label
 * and the PCB net must both use it, otherwise KiCad's schematic parity check
 * reports a net conflict.
 */
export function getUnnamedNetName(
  sourceTrace: SourceTrace,
  connectivityKey: string,
): string {
  const candidate =
    sourceTrace.display_name || sourceTrace.source_trace_id || ""
  const name = candidate
    .replace(/[^A-Za-z0-9_.+-]+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
  return name || connectivityKey
}
