import { expect, test } from "bun:test"
import { CircuitJsonToKicadSchConverter } from "lib"

/**
 * Tests for KiCad pin angle logic.
 *
 * KiCad Pin Angle Reference:
 * - Angle 0°:   Pin line extends LEFT      ←──o  (wire connects at 'o')
 * - Angle 180°: Pin line extends RIGHT     o──→  (wire connects at 'o')
 * - Angle 90°:  Pin line extends DOWN      o
 *                                          ↓
 * - Angle 270°: Pin line extends UP        ↑
 *                                          o
 *
 * For symbols, pins should point TOWARD the symbol body so wires connect on the outside.
 */

function createCircuitJsonWithPort(
  portX: number,
  portY: number,
  direction: string,
) {
  return [
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
      type: "schematic_component",
      schematic_component_id: "schematic_component_0",
      source_component_id: "source_component_0",
      center: { x: 0, y: 0 },
      rotation: 0,
      size: { width: 2, height: 2 },
    },
    {
      type: "schematic_symbol",
      schematic_symbol_id: "schematic_symbol_0",
      center: { x: 0, y: 0 },
      size: { width: 2, height: 2 },
    },
    {
      type: "schematic_port",
      schematic_port_id: "schematic_port_0",
      schematic_component_id: "schematic_component_0",
      source_port_id: "source_port_0",
      center: { x: portX, y: portY },
      facing_direction: direction,
      pin_number: 1,
    },
    {
      type: "schematic_circle",
      schematic_circle_id: "schematic_circle_0",
      schematic_component_id: "schematic_component_0",
      schematic_symbol_id: "schematic_symbol_0",
      center: { x: 0, y: 0 },
      radius: 0.5,
      stroke_width: 0.05,
    },
  ]
}

/**
 * Pin on RIGHT side of symbol should have angle=180
 *
 * Symbol layout:
 *   [  O  ]──o
 *            ↑ wire connects here
 *
 * Pin line extends RIGHT from symbol, angle=180
 */
test("custom-symbol07: pin on RIGHT side has angle 180", () => {
  const circuitJson = createCircuitJsonWithPort(1.0, 0, "right")

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()
  const kicadOutput = converter.getOutputString()

  // Pin should have angle 180 (line extends right)
  // Format in KiCad: (pin passive line (at X Y ANGLE) ...)
  const pinMatch = kicadOutput.match(
    /\(pin passive line\s*\(at ([\d.-]+) ([\d.-]+) (\d+)\)/,
  )
  expect(pinMatch).not.toBeNull()
  expect(pinMatch![3]).toBe("180") // angle should be 180
})

/**
 * Pin on LEFT side of symbol should have angle=0
 *
 * Symbol layout:
 *   o──[  O  ]
 *   ↑ wire connects here
 *
 * Pin line extends LEFT from symbol, angle=0
 */
test("custom-symbol07: pin on LEFT side has angle 0", () => {
  const circuitJson = createCircuitJsonWithPort(-1.0, 0, "left")

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()
  const kicadOutput = converter.getOutputString()

  // Pin should have angle 0 (line extends left)
  const pinMatch = kicadOutput.match(
    /\(pin passive line\s*\(at ([\d.-]+) ([\d.-]+) (\d+)\)/,
  )
  expect(pinMatch).not.toBeNull()
  expect(pinMatch![3]).toBe("0") // angle should be 0
})

/**
 * Pin on TOP of symbol should have angle=270
 *
 * Symbol layout:
 *        o  ← wire connects here
 *        |
 *     [  O  ]
 *
 * Pin line extends UP from symbol, angle=270
 */
test("custom-symbol07: pin on TOP has angle 270", () => {
  const circuitJson = createCircuitJsonWithPort(0, 1.0, "up")

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()
  const kicadOutput = converter.getOutputString()

  // Pin should have angle 270 (line extends up)
  const pinMatch = kicadOutput.match(
    /\(pin passive line\s*\(at ([\d.-]+) ([\d.-]+) (\d+)\)/,
  )
  expect(pinMatch).not.toBeNull()
  expect(pinMatch![3]).toBe("270") // angle should be 270
})

/**
 * Pin on BOTTOM of symbol should have angle=90
 *
 * Symbol layout:
 *     [  O  ]
 *        |
 *        o  ← wire connects here
 *
 * Pin line extends DOWN from symbol, angle=90
 */
test("custom-symbol07: pin on BOTTOM has angle 90", () => {
  const circuitJson = createCircuitJsonWithPort(0, -1.0, "down")

  const converter = new CircuitJsonToKicadSchConverter(circuitJson as any)
  converter.runUntilFinished()
  const kicadOutput = converter.getOutputString()

  // Pin should have angle 90 (line extends down)
  const pinMatch = kicadOutput.match(
    /\(pin passive line\s*\(at ([\d.-]+) ([\d.-]+) (\d+)\)/,
  )
  expect(pinMatch).not.toBeNull()
  expect(pinMatch![3]).toBe("90") // angle should be 90
})
