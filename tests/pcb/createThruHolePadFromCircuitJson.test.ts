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
  // KiCad drill offset: X is inverted (negative X = right), Y matches Circuit JSON direction
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
  const drill = pad!.drill
  expect(drill).toBeDefined()
  expect(drill!.offset).toBeDefined()
  // After 90° rotation, (-0.2, 0) becomes (0, -0.2) due to rotation matrix
  expect(drill!.offset!.x).toBeCloseTo(0, 5)
  expect(drill!.offset!.y).toBeCloseTo(-0.2)
})

test("createThruHolePadFromCircuitJson exports hole_with_polygon_pad as custom pad with primitives and real drill", () => {
  const platedHole: any = {
    type: "pcb_plated_hole" as const,
    shape: "hole_with_polygon_pad" as const,
    hole_shape: "circle" as const,
    hole_diameter: 1.2,
    hole_offset_x: 0,
    hole_offset_y: 0,
    pad_outline: [
      { x: -2, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: -2, y: 1 },
    ],
    x: 2,
    y: 3,
    layers: ["top", "bottom"],
    pcb_plated_hole_id: "pcb_plated_hole_poly_1",
  }

  const pad = createThruHolePadFromCircuitJson({
    platedHole,
    componentCenter: { x: 2, y: 3 },
    padNumber: 1,
    componentRotation: 0,
  })

  expect(pad).not.toBeNull()
  expect(pad!.shape).toBe("custom")
  expect(pad!.options?.anchor).toBe("circle")
  expect(pad!.drill?.diameter).toBeCloseTo(1.2)
  expect(pad!.primitives).toBeDefined()

  const sexp = pad!.getString()
  expect(sexp).toContain('(pad "1" thru_hole custom')
  expect(sexp).toContain("(drill 1.2)")
  expect(sexp).toContain("(gr_poly")
  expect(sexp).toContain("(xy 0 -2)")
})

test("createThruHolePadFromCircuitJson exports rotated oval hole_with_polygon_pad", () => {
  const platedHole: any = {
    type: "pcb_plated_hole" as const,
    shape: "hole_with_polygon_pad" as const,
    hole_shape: "oval" as const,
    hole_width: 1.0,
    hole_height: 1.8,
    hole_offset_x: 0,
    hole_offset_y: 0,
    ccw_rotation: 90,
    pad_outline: [
      { x: -2, y: -1 },
      { x: 2, y: -1 },
      { x: 2, y: 1 },
      { x: -2, y: 1 },
    ],
    x: 0,
    y: 0,
    layers: ["top", "bottom"],
    pcb_plated_hole_id: "pcb_plated_hole_poly_2",
  }

  const pad = createThruHolePadFromCircuitJson({
    platedHole,
    componentCenter: { x: 0, y: 0 },
    padNumber: 2,
    componentRotation: 0,
  })

  expect(pad).not.toBeNull()
  expect(pad!.shape).toBe("custom")
  expect(pad!.drill?.oval).toBe(true)
  expect(pad!.drill?.diameter).toBeCloseTo(1.0)
  expect(pad!.drill?.width).toBeCloseTo(1.8)

  const sexp = pad!.getString()
  expect(sexp).toContain("(drill oval 1 1.8)")
  // Point (2, -1) rotated 90 deg CCW is (1, 2), and with KiCad Y-flip becomes (1, -2)
  const poly = pad!.primitives?.graphics[0] as any
  const pts = poly?.contours?.[0]?.points
  expect(pts).toHaveLength(4)
  expect(pts[0].x).toBeCloseTo(1)
  expect(pts[0].y).toBeCloseTo(2)
  expect(pts[1].x).toBeCloseTo(1)
  expect(pts[1].y).toBeCloseTo(-2)
})
