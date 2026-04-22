import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import type { AnyCircuitElement } from "circuit-json"

test("pcb writes supplier part number to footprint text fields", () => {
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "source_component",
      source_component_id: "c1",
      name: "R1",
      ftype: "simple_resistor",
      resistance: 1000,
      supplier_part_numbers: { jlcpcb: ["C1525", "C307331"] },
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_c1",
      source_component_id: "c1",
      center: { x: 0, y: 0 },
      width: 1,
      height: 1,
      rotation: 0,
      layer: "top",
      obstructs_within_bounds: true,
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  expect(output).toContain('(property "Supplier Part Number" "C1525, C307331"')
})
