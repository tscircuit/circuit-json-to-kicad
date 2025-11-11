import { expect, test } from "bun:test"
import { createThruHolePadFromCircuitJson } from "lib/pcb/stages/utils/CreateThruHolePadFromCircuitJson"

test("createThruHolePadFromCircuitJson applies hole offset without rotation", () => {
  const platedHole: any = {
    type: "pcb_plated_hole" as const,
    shape: "pill_hole_with_rect_pad" as const,
    hole_shape: "pill" as const,
    pad_shape: "rect" as const,
    hole_width: 0.6,
    hole_height: 1.2,
    rect_pad_width: 1.6,
    rect_pad_height: 2,
    hole_offset_x: 0.2,
    hole_offset_y: 0.1,
    x: 5,
    y: 5,
    layers: ["F.Cu", "B.Cu"],
    pcb_plated_hole_id: "pcb_plated_hole_test",
  }

  const pad = createThruHolePadFromCircuitJson({
    platedHole,
    componentCenter: { x: 5, y: 5 },
    padNumber: 1,
    componentRotation: 0,
  })

  expect(pad).not.toBeNull()
  const drill = pad!.drill
  expect(drill).toBeDefined()
  expect(drill!.offset).toBeDefined()
  expect(drill!.offset!.x).toBeCloseTo(0.2)
  expect(drill!.offset!.y).toBeCloseTo(-0.1)
})

test("createThruHolePadFromCircuitJson rotates hole offset with component", () => {
  const platedHole: any = {
    type: "pcb_plated_hole" as const,
    shape: "pill_hole_with_rect_pad" as const,
    hole_shape: "pill" as const,
    pad_shape: "rect" as const,
    hole_width: 0.6,
    hole_height: 1.2,
    rect_pad_width: 1.6,
    rect_pad_height: 2,
    hole_offset_x: 0.2,
    hole_offset_y: 0,
    x: 5,
    y: 5,
    layers: ["F.Cu", "B.Cu"],
    pcb_plated_hole_id: "pcb_plated_hole_test",
  }

  const pad = createThruHolePadFromCircuitJson({
    platedHole,
    componentCenter: { x: 5, y: 5 },
    padNumber: 1,
    componentRotation: 90,
  })

  expect(pad).not.toBeNull()
  const drill = pad!.drill
  expect(drill).toBeDefined()
  expect(drill!.offset).toBeDefined()
  expect(drill!.offset!.x).toBeCloseTo(0, 5)
  expect(drill!.offset!.y).toBeCloseTo(0.2)
})
