import type { AnyCircuitElement } from "circuit-json"
import { expect, test } from "bun:test"
import { KicadPcb } from "kicadts"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"

test("standalone rotated pill hole gets unique footprint name and rotation", () => {
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
      type: "pcb_hole",
      pcb_hole_id: "pcb_hole_1",
      hole_shape: "rotated_pill",
      hole_width: 4,
      hole_height: 2,
      ccw_rotation: 30,
      x: 3,
      y: -2,
    },
  ]

  const converter = new CircuitJsonToKicadPcbConverter(circuitJson)
  converter.runUntilFinished()

  const kicadPcb = KicadPcb.parse(converter.getOutputString())[0] as KicadPcb
  const footprint = kicadPcb.footprints.find(
    (fp) =>
      fp.libraryLink ===
      "tscircuit:hole_rotated_pill_holeWidth4mm_holeHeight2mm_ccwRotation30deg",
  )

  expect(footprint).toBeDefined()
  expect(footprint!.fpPads).toHaveLength(1)
  expect(footprint!.fpPads[0]?.shape).toBe("oval")
  expect(footprint!.fpPads[0]?.at?.angle).toBe(30)
  expect(footprint!.fpPads[0]?.drill?.oval).toBe(true)
  expect(footprint!.fpPads[0]?.drill?.diameter).toBeCloseTo(4)
  expect(footprint!.fpPads[0]?.drill?.width).toBeCloseTo(2)
})
