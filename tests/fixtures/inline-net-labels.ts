import type { CircuitJson, Point } from "circuit-json"
import { CircuitJsonToKicadSchConverter } from "lib"
import { applyToPoint } from "transformation-matrix"
import fixture from "./inline-net-labels.json"

// Two resistor pins should connect through automatic SIGNAL labels:
// R1.2 --- SIGNAL       SIGNAL --- R2.1
export function createInlineLabelCircuit(): CircuitJson {
  return structuredClone(fixture) as CircuitJson
}

export function convertWireLabelCircuit(openEnd: Point) {
  const circuit = createInlineLabelCircuit()
  for (const row of circuit) {
    if (
      row.type === "schematic_trace" &&
      row.source_trace_id === "source_trace_0"
    ) {
      row.edges = [{ from: { x: 0, y: 0 }, to: openEnd }]
    }
    if (
      row.type === "schematic_port" &&
      row.source_port_id === "source_port_1"
    ) {
      row.center = { x: 0, y: 0 }
    }
  }
  const converter = new CircuitJsonToKicadSchConverter(circuit)
  converter.runUntilFinished()
  return {
    label: converter.getOutput().labels[0],
    anchor: applyToPoint(converter.ctx.c2kMatSch!, openEnd),
  }
}

export function createInlineLabelSheet({
  name,
  resistorNames,
}: {
  name: string
  resistorNames: [string, string]
}): CircuitJson {
  // Give each sheet independent IDs while keeping the same SIGNAL label text.
  const circuit = createInlineLabelCircuit()
  for (const row of circuit) {
    for (const [key, value] of Object.entries(row)) {
      if (key.endsWith("_id") || key === "subcircuit_connectivity_map_key") {
        Object.assign(row, { [key]: `${name}_${value}` })
      } else if (key.endsWith("_ids") && Array.isArray(value)) {
        Object.assign(row, { [key]: value.map((id) => `${name}_${id}`) })
      }
    }
    if (row.type.startsWith("schematic_")) {
      Object.assign(row, { schematic_sheet_id: name })
    }
    if (row.type === "source_component") {
      row.name = row.name === "R1" ? resistorNames[0] : resistorNames[1]
    }
  }
  return [
    { type: "schematic_sheet", schematic_sheet_id: name, name },
    ...circuit,
  ]
}
