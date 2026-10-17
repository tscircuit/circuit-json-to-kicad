import type { CircuitJson } from "circuit-json"
import fixture from "./inline-label-connectivity.json"

// Generated with tscircuit 0.0.2460 from the two-resistor repro in #552,
// with R2 at (20, 6) so core emits separate wire stubs and automatic labels.
export function getInlineLabelCircuit(): CircuitJson {
  return structuredClone(fixture) as CircuitJson
}
