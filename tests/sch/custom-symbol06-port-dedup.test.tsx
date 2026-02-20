import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"

/**
 * Test port deduplication for custom symbols.
 *
 * This test uses raw circuit JSON to explicitly create duplicate ports
 * with the same pin_number at different positions. The converter should
 * keep only the first port (custom symbol port at correct position).
 */
test("custom-symbol06: deduplicates ports with same pin_number", () => {
  // Raw circuit JSON with EXPLICIT duplicate ports
  const circuitJson = [
    {
      type: "source_component",
      source_component_id: "source_component_0",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "source_port",
      source_port_id: "source_port_0",
      name: "1",
      pin_number: 1,
      source_component_id: "source_component_0",
    },
    {
      type: "source_port",
      source_port_id: "source_port_1",
      name: "pin1",
      pin_number: 1,
      source_component_id: "source_component_0",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_0",
      source_component_id: "source_component_0",
      center: { x: 0, y: 0 },
      rotation: 0,
      size: { width: 2, height: 1 },
    },
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_0",
      center: { x: 0, y: 0 },
      size: { width: 2, height: 1 },
    },
    // FIRST port (custom symbol position) - should be KEPT
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_0",
      schematic_component_id: "schematic_component_0",
      source_port_id: "source_port_0",
      center: { x: 1.5, y: 0 }, // Custom position on RIGHT
      facing_direction: "right",
      pin_number: 1,
    },
    // SECOND port (auto-generated position) - should be DISCARDED
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_1",
      schematic_component_id: "schematic_component_0",
      source_port_id: "source_port_1",
      center: { x: -0.6, y: 0 }, // Auto-generated position on LEFT
      facing_direction: "left",
      pin_number: 1, // SAME pin_number - this is the duplicate!
    },
    // Custom symbol circle
    {
      type: "schematic_circle",
      schematic_circle_id: "schematic_circle_0",
      schematic_component_id: "schematic_component_0",
      schematic_symbol_id: "schematic_symbol_0",
      center: { x: 0, y: 0 },
      radius: 0.5,
      stroke_width: 0.05,
      is_filled: true,
    },
    // Line to port
    {
      type: "schematic_line",
      schematic_line_id: "schematic_line_0",
      schematic_component_id: "schematic_component_0",
      schematic_symbol_id: "schematic_symbol_0",
      x1: 0.5,
      y1: 0,
      x2: 1.5,
      y2: 0,
      stroke_width: 0.05,
    },
  ]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()
  const kicadOutput = converter.getOutputString()

  // Count pins with number "1" - should be exactly ONE (deduplicated)
  const pin1Matches = kicadOutput.match(/\(number "1"/g)
  expect(pin1Matches?.length).toBe(1)

  // Verify the pin is at the FIRST port's position (x=1.5, unscaled for custom symbols)
  // The library symbol pin should be at (1.5 0) since custom symbols use scale=1
  expect(kicadOutput).toContain("(at 1.5 0")
})

/**
 * Test that ports with DIFFERENT pin_numbers are NOT deduplicated.
 */
test("custom-symbol06: keeps ports with different pin_numbers", () => {
  const circuitJson = [
    {
      type: "source_component",
      source_component_id: "source_component_0",
      name: "U1",
      ftype: "simple_chip",
    },
    {
      type: "source_port",
      source_port_id: "source_port_0",
      name: "1",
      pin_number: 1,
      source_component_id: "source_component_0",
    },
    {
      type: "source_port",
      source_port_id: "source_port_1",
      name: "2",
      pin_number: 2,
      source_component_id: "source_component_0",
    },
    {
      type: "schematic_component",
      schematic_component_id: "schematic_component_0",
      source_component_id: "source_component_0",
      center: { x: 0, y: 0 },
      rotation: 0,
      size: { width: 2, height: 1 },
    },
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_0",
      center: { x: 0, y: 0 },
      size: { width: 2, height: 1 },
    },
    // Port for pin 1 on left
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_0",
      schematic_component_id: "schematic_component_0",
      source_port_id: "source_port_0",
      center: { x: -1, y: 0 },
      facing_direction: "left",
      pin_number: 1,
    },
    // Port for pin 2 on right - DIFFERENT pin_number, should NOT be deduplicated
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_1",
      schematic_component_id: "schematic_component_0",
      source_port_id: "source_port_1",
      center: { x: 1, y: 0 },
      facing_direction: "right",
      pin_number: 2,
    },
    // Custom symbol rectangle
    {
      type: "schematic_path",
      schematic_path_id: "schematic_path_0",
      schematic_component_id: "schematic_component_0",
      schematic_symbol_id: "schematic_symbol_0",
      points: [
        { x: -0.5, y: -0.3 },
        { x: 0.5, y: -0.3 },
        { x: 0.5, y: 0.3 },
        { x: -0.5, y: 0.3 },
        { x: -0.5, y: -0.3 },
      ],
      stroke_width: 0.05,
    },
  ]

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()
  const kicadOutput = converter.getOutputString()

  // Should have TWO pins (different pin_numbers, no deduplication)
  const pinMatches = kicadOutput.match(/\(pin passive line/g)
  expect(pinMatches?.length).toBe(2)

  // Both pin numbers should be present
  expect(kicadOutput).toContain('(number "1"')
  expect(kicadOutput).toContain('(number "2"')
})
