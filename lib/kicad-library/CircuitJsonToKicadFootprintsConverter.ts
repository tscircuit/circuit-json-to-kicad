import type { CircuitJson } from "circuit-json"
import {
  CircuitJsonToKicadLibraryConverter,
  type FootprintEntry,
} from "./CircuitJsonToKicadLibraryConverter"

export interface CircuitJsonToKicadFootprintsOptions {
  libraryName?: string
  footprintLibraryName?: string
}

export function convertCircuitJsonToKicadFootprints(
  circuitJson: CircuitJson,
  options: CircuitJsonToKicadFootprintsOptions = {},
): FootprintEntry[] {
  const converter = new CircuitJsonToKicadLibraryConverter(circuitJson, options)
  converter.runUntilFinished()
  return converter.getFootprints()
}
