import type { AnyCircuitElement } from "circuit-json"
import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

/**
 * Regression test for hole_offset sign convention.
 *
 * Bug: CreateThruHolePadFromCircuitJson negated the X component of the hole
 * offset but not Y, inverting the horizontal offset in the KiCad output.
 *
 * Fix: circuit-json uses Y-up coordinates; KiCad uses Y-down. Only Y needs to
 * be negated when converting the offset. X stays the same.
 */
test("pcb basics18 - plated hole offset sign is preserved correctly", () => {
  const circuitJson: AnyCircuitElement[] = [
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_1",
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
      center: { x: 0, y: 0 },
      outline: [
        { x: -10, y: -10 },
        { x: 10, y: -10 },
        { x: 10, y: 10 },
        { x: -10, y: 10 },
      ],
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb_component_1",
      source_component_id: "source_component_1",
      center: { x: 0, y: 0 },
      width: 4,
      height: 4,
      layer: "top",
      rotation: 0,
      obstructs_within_bounds: false,
    },
    // Pad with negative X offset — drill should land to the LEFT of pad center.
    {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: "plated_hole_1",
      pcb_component_id: "pcb_component_1",
      shape: "circular_hole_with_rect_pad",
      x: 0,
      y: 0,
      hole_diameter: 0.5,
      rect_pad_width: 0.5,
      rect_pad_height: 0.5,
      hole_offset_x: -0.25,
      hole_offset_y: 0,
      layers: ["top", "bottom"],
      port_hints: ["pin1"],
    } as any,
    // Pad with positive Y offset in circuit-json (Y-up) — KiCad Y-down should be negative.
    {
      type: "pcb_plated_hole",
      pcb_plated_hole_id: "plated_hole_2",
      pcb_component_id: "pcb_component_1",
      shape: "circular_hole_with_rect_pad",
      x: 1,
      y: 1,
      hole_diameter: 0.5,
      rect_pad_width: 0.5,
      rect_pad_height: 0.5,
      hole_offset_x: 0,
      hole_offset_y: 0.3,
      layers: ["top", "bottom"],
      port_hints: ["pin2"],
    } as any,
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()
  const output = converter.getOutputString()

  // Extract all drill offset lines
  const offsetMatches = [...output.matchAll(/\(offset\s+([-\d.]+)\s+([-\d.]+)\)/g)]
  expect(offsetMatches.length).toBe(2)

  // Pad 1: hole_offset_x=-0.25, hole_offset_y=0
  // Expected KiCad offset: x=-0.25 (same), y=0 (no flip needed for zero)
  const offset1 = offsetMatches[0]!
  expect(parseFloat(offset1[1]!)).toBeCloseTo(-0.25, 5)
  expect(parseFloat(offset1[2]!)).toBeCloseTo(0, 5)

  // Pad 2: hole_offset_x=0, hole_offset_y=0.3 (circuit-json Y-up)
  // Expected KiCad offset: x=0, y=-0.3 (Y flipped to Y-down)
  const offset2 = offsetMatches[1]!
  expect(parseFloat(offset2[1]!)).toBeCloseTo(0, 5)
  expect(parseFloat(offset2[2]!)).toBeCloseTo(-0.3, 5)
})
