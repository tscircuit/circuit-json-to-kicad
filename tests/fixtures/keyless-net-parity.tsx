import { expect } from "bun:test"
import { source_port, source_trace, type CircuitJson } from "circuit-json"
import { parseKicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib"
import { Circuit } from "tscircuit"

export function removeConnectivityKeys(circuitJson: CircuitJson) {
  for (const element of circuitJson) {
    if ("subcircuit_connectivity_map_key" in element)
      delete element.subcircuit_connectivity_map_key
  }
}

export function expectValidSourceRows(circuitJson: CircuitJson) {
  for (const element of circuitJson) {
    if (element.type === "source_trace")
      expect(source_trace.safeParse(element).success).toBe(true)
    if (element.type === "source_port")
      expect(source_port.safeParse(element).success).toBe(true)
  }
}

export function readPcb(circuitJson: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const pcb = parseKicadPcb(converter.getOutputString())
  const pads = new Map(
    pcb.footprints.flatMap((footprint) => {
      const reference = footprint.properties.find(
        (property) => property.key === "Reference",
      )!.value
      return footprint.fpPads.map(
        (pad) => [`${reference}.${pad.number}`, pad.net] as const,
      )
    }),
  )
  return { pcb, pads }
}

export async function renderResistorCapacitor() {
  const circuit = new Circuit()
  circuit.add(
    <board width="20mm" height="10mm">
      <resistor name="R1" resistance="1k" footprint="0603" pcbX={-3} pcbY={0} />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0603"
        pcbX={3}
        pcbY={0}
      />
      <trace from=".R1 > .pin2" to=".C1 > .pin1" />
    </board>,
  )
  await circuit.renderUntilSettled()
  return circuit.getCircuitJson()
}
