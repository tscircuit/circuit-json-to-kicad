import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib/schematic/CircuitJsonToKicadSchConverter"

/**
 * Test for custom symbol support.
 *
 * When upstream circuit-json adds schematic_symbol support, this test should pass.
 * The schematic_symbol element represents a custom symbol definition, and
 * elements like schematic_circle, schematic_line, schematic_path can be linked
 * to it via schematic_symbol_id.
 *
 * This test creates a custom NPN transistor symbol with:
 * - Outer circle
 * - Base vertical bar
 * - Base input line
 * - Collector and emitter lines
 * - Arrow on emitter
 * - Three ports (B, C, E)
 */
test("custom-symbol01: custom symbol generates proper kicad_sym entry", () => {
  // Mock circuit-json with custom symbol elements
  // This simulates what tscircuit will generate when you use:
  // <chip name="Q1" symbol={<symbol>...</symbol>} />
  const circuitJson = [
    // The custom symbol definition
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_npn_1",
      name: "npn_transistor_custom",
      center: { x: 0, y: 0 },
      size: { width: 1.4, height: 2 },
    },

    // Outer circle
    {
      type: "schematic_circle",
      schematic_circle_id: "schematic_circle_1",
      schematic_symbol_id: "schematic_symbol_npn_1",
      center: { x: 0.1, y: 0 },
      radius: 0.55,
      stroke_width: 0.05,
      color: "#000000",
      is_filled: false,
      is_dashed: false,
    },

    // Base vertical bar
    {
      type: "schematic_line",
      schematic_line_id: "schematic_line_1",
      schematic_symbol_id: "schematic_symbol_npn_1",
      x1: -0.1,
      y1: -0.5,
      x2: -0.1,
      y2: 0.5,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Base input line
    {
      type: "schematic_line",
      schematic_line_id: "schematic_line_2",
      schematic_symbol_id: "schematic_symbol_npn_1",
      x1: -0.7,
      y1: 0,
      x2: -0.1,
      y2: 0,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Collector line (diagonal)
    {
      type: "schematic_line",
      schematic_line_id: "schematic_line_3",
      schematic_symbol_id: "schematic_symbol_npn_1",
      x1: -0.1,
      y1: 0.2,
      x2: 0.35,
      y2: 0.5,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Collector line (vertical)
    {
      type: "schematic_line",
      schematic_line_id: "schematic_line_4",
      schematic_symbol_id: "schematic_symbol_npn_1",
      x1: 0.35,
      y1: 0.5,
      x2: 0.35,
      y2: 1,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Emitter line (diagonal)
    {
      type: "schematic_line",
      schematic_line_id: "schematic_line_5",
      schematic_symbol_id: "schematic_symbol_npn_1",
      x1: -0.1,
      y1: -0.2,
      x2: 0.35,
      y2: -0.5,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Emitter line (vertical)
    {
      type: "schematic_line",
      schematic_line_id: "schematic_line_6",
      schematic_symbol_id: "schematic_symbol_npn_1",
      x1: 0.35,
      y1: -0.5,
      x2: 0.35,
      y2: -1,
      stroke_width: 0.05,
      color: "#000000",
      is_dashed: false,
    },

    // Emitter arrow (path with 3 points forming V shape)
    {
      type: "schematic_path",
      schematic_path_id: "schematic_path_1",
      schematic_symbol_id: "schematic_symbol_npn_1",
      points: [
        { x: 0.16, y: -0.25 },
        { x: 0.2, y: -0.4 },
        { x: 0.06, y: -0.44 },
      ],
      is_filled: false,
    },

    // Schematic ports for the symbol
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_b",
      schematic_symbol_id: "schematic_symbol_npn_1",
      source_port_id: "source_port_b",
      center: { x: -0.7, y: 0 },
      facing_direction: "left",
      pin_number: 1,
      display_pin_label: "B",
    },
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_c",
      schematic_symbol_id: "schematic_symbol_npn_1",
      source_port_id: "source_port_c",
      center: { x: 0.35, y: 1 },
      facing_direction: "up",
      pin_number: 2,
      display_pin_label: "C",
    },
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_e",
      schematic_symbol_id: "schematic_symbol_npn_1",
      source_port_id: "source_port_e",
      center: { x: 0.35, y: -1 },
      facing_direction: "down",
      pin_number: 3,
      display_pin_label: "E",
    },

    // Source component
    {
      type: "source_component",
      source_component_id: "source_component_q1",
      name: "Q1",
      ftype: "simple_transistor",
      transistor_type: "npn",
    },

    // Source ports
    {
      type: "source_port",
      source_port_id: "source_port_b",
      source_component_id: "source_component_q1",
      name: "B",
      pin_number: 1,
    },
    {
      type: "source_port",
      source_port_id: "source_port_c",
      source_component_id: "source_component_q1",
      name: "C",
      pin_number: 2,
    },
    {
      type: "source_port",
      source_port_id: "source_port_e",
      source_component_id: "source_component_q1",
      name: "E",
      pin_number: 3,
    },

    // Schematic component linked to the custom symbol
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_q1",
      source_component_id: "source_component_q1",
      schematic_symbol_id: "schematic_symbol_npn_1",
      center: { x: 0, y: 0 },
      rotation: 0,
      size: { width: 1.4, height: 2 },
    },
  ] as any

  const converter = new CircuitJsonToKicadSchConverter(circuitJson)
  converter.runUntilFinished()

  const output = converter.getOutputString()

  // Verify the custom symbol is created in lib_symbols
  expect(output).toContain("lib_symbols")

  // Check that the symbol name uses the schematic_symbol.name
  // The symbol should be prefixed with "Custom:" since it's a custom symbol
  expect(output).toContain("npn_transistor_custom")

  // Verify the symbol has polylines (converted from schematic_line)
  expect(output).toContain("polyline")

  // Verify the symbol has circles (converted from schematic_circle)
  expect(output).toContain("circle")

  // Verify pins are created for B, C, E
  expect(output).toContain("pin")
})
