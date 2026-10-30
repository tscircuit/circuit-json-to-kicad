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
  expect(pad!.at?.x).toBeCloseTo(0.2)
  expect(pad!.at?.y).toBeCloseTo(-0.1)
  const drill = pad!.drill
  expect(drill).toBeDefined()
  expect(drill!.offset).toBeDefined()
  // KiCad drill offset shifts the copper pad from pad.at (the drill center) back to (0, 0)
  expect(drill!.offset!.x).toBeCloseTo(-0.2)
  expect(drill!.offset!.y).toBeCloseTo(0.1)
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
  expect(pad!.at?.x).toBeCloseTo(0, 5)
  expect(pad!.at?.y).toBeCloseTo(0.2)
  const drill = pad!.drill
  expect(drill).toBeDefined()
  expect(drill!.offset).toBeDefined()
  // After 90° rotation, (-0.2, 0) becomes (0, -0.2) due to rotation matrix
  expect(drill!.offset!.x).toBeCloseTo(0, 5)
  expect(drill!.offset!.y).toBeCloseTo(-0.2)
})

test("createThruHolePadFromCircuitJson places castellated drill on board edge and keeps pad copper at platedHole center", () => {
  const leftEdgeCastellatedHole: any = {
    type: "pcb_plated_hole" as const,
    pcb_plated_hole_id: "pcb_plated_hole_0",
    pcb_component_id: "pcb_component_0",
    hole_diameter: 0.5,
    rect_pad_width: 0.5,
    rect_pad_height: 0.5,
    shape: "circular_hole_with_rect_pad" as const,
    x: -3.75,
    y: 2.5,
    layers: ["top", "bottom"],
    hole_offset_x: -0.25,
    hole_offset_y: 0,
    rect_border_radius: 0,
  }

  const pad = createThruHolePadFromCircuitJson({
    platedHole: leftEdgeCastellatedHole,
    componentCenter: { x: 0, y: 0 },
    padNumber: 1,
    componentRotation: 0,
  })

  expect(pad).not.toBeNull()
  // Drill hole center is at x = -3.75 + (-0.25) = -4.0, y = -2.5
  expect(pad!.at?.x).toBeCloseTo(-4.0)
  expect(pad!.at?.y).toBeCloseTo(-2.5)
  // Pad copper center in KiCad is pad.at + drill.offset = (-3.75, -2.5)
  expect(pad!.drill?.offset?.x).toBeCloseTo(0.25)
  expect(pad!.drill?.offset?.y).toBeCloseTo(0)
  expect((pad!.at?.x ?? 0) + (pad!.drill?.offset?.x ?? 0)).toBeCloseTo(-3.75)
  expect((pad!.at?.y ?? 0) + (pad!.drill?.offset?.y ?? 0)).toBeCloseTo(-2.5)
})
