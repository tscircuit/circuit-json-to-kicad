import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"

/**
 * Test that schematic_symbol.name takes priority over other naming sources.
 *
 * Naming precedence:
 * 1. schematic_symbol.name (highest priority)
 * 2. manufacturer_part_number / footprinter_string
 * 3. Generated name based on ftype
 */
test("custom-symbol02: schematic_symbol.name takes priority in naming", () => {
  const circuitJson = [
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_1",
      name: "my_custom_symbol", // This should be used (highest priority)
      center: { x: 0, y: 0 },
      size: { width: 1, height: 1 },
    },
    {
      type: "schematic_circle",
      schematic_circle_id: "schematic_circle_1",
      schematic_symbol_id: "schematic_symbol_1",
      center: { x: 0, y: 0 },
      radius: 0.5,
      stroke_width: 0.05,
      color: "#000000",
      is_filled: false,
      is_dashed: false,
    },
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_1",
      schematic_symbol_id: "schematic_symbol_1",
      source_port_id: "source_port_1",
      center: { x: 0.5, y: 0 },
      facing_direction: "right",
      pin_number: 1,
      display_pin_label: "1",
    },
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "U1",
      ftype: "simple_chip",
      manufacturer_part_number: "SOME_PART", // Would be 2nd priority
    },
    {
      type: "source_port",
      source_port_id: "source_port_1",
      source_component_id: "source_component_1",
      name: "1",
      pin_number: 1,
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_1",
      source_component_id: "source_component_1",
      schematic_symbol_id: "schematic_symbol_1",
      center: { x: 0, y: 0 },
      rotation: 0,
      size: { width: 1, height: 1 },
    },
  ] as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // The symbol name should be from schematic_symbol.name, not manufacturer_part_number
  expect(output).toContain("my_custom_symbol")
})
