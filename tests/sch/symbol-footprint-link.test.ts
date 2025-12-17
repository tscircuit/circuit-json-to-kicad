import { test, expect } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"

test("schematic symbols have footprint property linking to footprints", () => {
  const circuitJson = [
    {
      type: "source_component",
      source_component_id: "source_component_0",
      name: "R1",
      ftype: "simple_resistor",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_0",
      source_component_id: "source_component_0",
      center: { x: 0, y: 0 },
      rotation: 0,
      size: { width: 1, height: 0.5 },
    },
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_1",
      source_component_id: "source_component_1",
      center: { x: 5, y: 0 },
      rotation: 0,
      size: { width: 2, height: 2 },
    },
  ] as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // Verify lib_symbols have Footprint property linking to footprints
  // Custom symbols (like chips) get footprint references in lib_symbols
  expect(output).toContain('(property "Footprint" "tscircuit:simple_chip"')
})
