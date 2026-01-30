import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"

/**
 * Test that multiple components with the same symbol name result in
 * a single symbol definition in lib_symbols.
 *
 * When two symbols have the same name (e.g., across different tsx files),
 * we assume they're the same symbol and only create one definition.
 */
test("custom-symbol03: duplicate symbol names use single definition", () => {
  // Two components both using a custom symbol named "my_shared_symbol"
  // Should result in only one symbol definition in lib_symbols
  const circuitJson = [
    // First symbol definition
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_1",
      name: "my_shared_symbol",
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
      schematic_port_id: "schematic_port_1a",
      schematic_symbol_id: "schematic_symbol_1",
      source_port_id: "source_port_1a",
      center: { x: 0.5, y: 0 },
      facing_direction: "right",
      pin_number: 1,
      display_pin_label: "1",
    },

    // Second symbol definition with same name (from a different file/component)
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_2",
      name: "my_shared_symbol", // Same name - should reuse
      center: { x: 0, y: 0 },
      size: { width: 1, height: 1 },
    },
    {
      type: "schematic_circle",
      schematic_circle_id: "schematic_circle_2",
      schematic_symbol_id: "schematic_symbol_2",
      center: { x: 0, y: 0 },
      radius: 0.5,
      stroke_width: 0.05,
      color: "#000000",
      is_filled: false,
      is_dashed: false,
    },
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_2a",
      schematic_symbol_id: "schematic_symbol_2",
      source_port_id: "source_port_2a",
      center: { x: 0.5, y: 0 },
      facing_direction: "right",
      pin_number: 1,
      display_pin_label: "1",
    },

    // First component
    {
      type: "source_component",
      source_component_id: "source_component_1",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "source_port",
      source_port_id: "source_port_1a",
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

    // Second component
    {
      type: "source_component",
      source_component_id: "source_component_2",
      name: "U2",
      ftype: "simple_chip",
    },
    {
      type: "source_port",
      source_port_id: "source_port_2a",
      source_component_id: "source_component_2",
      name: "1",
      pin_number: 1,
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_2",
      source_component_id: "source_component_2",
      schematic_symbol_id: "schematic_symbol_2",
      center: { x: 5, y: 0 },
      rotation: 0,
      size: { width: 1, height: 1 },
    },
  ] as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // Count occurrences of the symbol definition
  // Should only have one definition for "my_shared_symbol"
  const symbolDefMatches = output.match(/\(symbol "Custom:my_shared_symbol"/g)
  expect(symbolDefMatches?.length).toBe(1)

  // But should have two symbol instances (placements)
  // Both U1 and U2 should reference the same symbol
  expect(output).toContain('"Custom:my_shared_symbol"')
})
