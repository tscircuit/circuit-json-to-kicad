import type { CircuitJson } from "circuit-json"
import circuitJson from "../assets/autorouted-inner-layer-vias.json"

export function createAutoroutedInnerLayerVias(): CircuitJson {
  // Unmodified output from published tscircuit automatic fanout; see the
  // adjacent fixture provenance. No paths or via positions were hand-authored.
  return structuredClone(circuitJson) as CircuitJson
}
