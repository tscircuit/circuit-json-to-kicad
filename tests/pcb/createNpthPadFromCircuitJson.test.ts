import { expect, test } from "bun:test"
import { CircuitJsonToKicadPcbConverter } from "lib/pcb/CircuitJsonToKicadPcbConverter"
import { createNpthPadFromCircuitJson } from "lib/pcb/stages/utils/CreateNpthPadFromCircuitJson"

test("createNpthPadFromCircuitJson exports square, rect, and rotated_rect non-plated holes", () => {
  const squarePad = createNpthPadFromCircuitJson({
    pcbHole: {
      type: "pcb_hole",
      pcb_hole_id: "pcb_hole_square_1",
      hole_shape: "square",
      hole_diameter: 2.4,
      x: 1,
      y: 2,
    },
    componentCenter: { x: 1, y: 2 },
  })
  expect(squarePad).not.toBeNull()
  expect(squarePad!.shape).toBe("rect")
  expect(squarePad!.size?.width).toBeCloseTo(2.4)
  expect(squarePad!.size?.height).toBeCloseTo(2.4)
  expect(squarePad!.drill?.diameter).toBeCloseTo(2.4)

  const rectPad = createNpthPadFromCircuitJson({
    pcbHole: {
      type: "pcb_hole",
      pcb_hole_id: "pcb_hole_rect_1",
      hole_shape: "rect",
      hole_width: 3.2,
      hole_height: 1.6,
      x: 0,
      y: 0,
    },
    componentCenter: { x: 0, y: 0 },
  })
  expect(rectPad).not.toBeNull()
  expect(rectPad!.shape).toBe("rect")
  expect(rectPad!.size?.width).toBeCloseTo(3.2)
  expect(rectPad!.size?.height).toBeCloseTo(1.6)
  expect(rectPad!.drill?.oval).toBe(true)
  expect(rectPad!.drill?.diameter).toBeCloseTo(3.2)
  expect(rectPad!.drill?.width).toBeCloseTo(1.6)

  const rotatedRectPad = createNpthPadFromCircuitJson({
    pcbHole: {
      type: "pcb_hole",
      pcb_hole_id: "pcb_hole_rotated_rect_1",
      hole_shape: "rotated_rect",
      hole_width: 2.8,
      hole_height: 1.4,
      ccw_rotation: 45,
      x: -2,
      y: 3,
    } as any,
    componentCenter: { x: -2, y: 3 },
  })
  expect(rotatedRectPad).not.toBeNull()
  expect(rotatedRectPad!.shape).toBe("rect")
  expect(rotatedRectPad!.at?.angle).toBe(45)
  expect(rotatedRectPad!.size?.width).toBeCloseTo(2.8)
  expect(rotatedRectPad!.size?.height).toBeCloseTo(1.4)
  expect(rotatedRectPad!.drill?.oval).toBe(true)
  expect(rotatedRectPad!.drill?.diameter).toBeCloseTo(2.8)
  expect(rotatedRectPad!.drill?.width).toBeCloseTo(1.4)
})

test("AddStandalonePcbElements exports descriptive libraryLink for square, rect, and rotated_rect holes", () => {
  const converter = new CircuitJsonToKicadPcbConverter([
    {
      type: "pcb_board",
      pcb_board_id: "pcb_board_1",
      center: { x: 0, y: 0 },
      width: 20,
      height: 20,
      thickness: 1.6,
      num_layers: 2,
      material: "fr4",
    },
    {
      type: "pcb_hole",
      pcb_hole_id: "hole_sq",
      hole_shape: "square",
      hole_diameter: 2,
      x: -4,
      y: 0,
    },
    {
      type: "pcb_hole",
      pcb_hole_id: "hole_rect",
      hole_shape: "rect",
      hole_width: 3,
      hole_height: 1.5,
      x: 0,
      y: 0,
    },
    {
      type: "pcb_hole",
      pcb_hole_id: "hole_rot_rect",
      hole_shape: "rotated_rect",
      hole_width: 2.5,
      hole_height: 1.2,
      ccw_rotation: 30,
      x: 4,
      y: 0,
    },
  ] as any)

  converter.runUntilFinished()
  const footprints = converter.getOutput().footprints
  expect(footprints.map((fp) => fp.libraryLink)).toEqual([
    "tscircuit:hole_square_holeDiameter2mm",
    "tscircuit:hole_rect_holeWidth3mm_holeHeight1.5mm",
    "tscircuit:hole_rotated_rect_holeWidth2.5mm_holeHeight1.2mm_ccwRotation30deg",
  ])
})
