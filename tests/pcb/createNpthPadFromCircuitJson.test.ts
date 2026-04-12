import { expect, test } from "bun:test"
import { createNpthPadFromCircuitJson } from "lib/pcb/stages/utils/CreateNpthPadFromCircuitJson"

test("createNpthPadFromCircuitJson supports rotated pill holes", () => {
  const pcbHole: any = {
    type: "pcb_hole" as const,
    pcb_hole_id: "pcb_hole_test",
    hole_shape: "rotated_pill" as const,
    hole_width: 0.8,
    hole_height: 1.6,
    ccw_rotation: 30,
    x: 5,
    y: 5,
  }

  const pad = createNpthPadFromCircuitJson({
    pcbHole,
    componentCenter: { x: 5, y: 5 },
    componentRotation: 0,
  })

  expect(pad).not.toBeNull()
  expect(pad!.shape).toBe("oval")
  expect(pad!.at?.x).toBeCloseTo(0)
  expect(pad!.at?.y).toBeCloseTo(0)
  expect(pad!.at?.angle).toBe(30)
  expect(pad!.size?.width).toBeCloseTo(0.8)
  expect(pad!.size?.height).toBeCloseTo(1.6)
  expect(pad!.drill?.oval).toBe(true)
  expect(pad!.drill?.diameter).toBeCloseTo(0.8)
  expect(pad!.drill?.width).toBeCloseTo(1.6)
})

test("createNpthPadFromCircuitJson rotates position but preserves hole angle", () => {
  const pcbHole: any = {
    type: "pcb_hole" as const,
    pcb_hole_id: "pcb_hole_test",
    hole_shape: "rotated_pill" as const,
    hole_width: 0.8,
    hole_height: 1.6,
    ccw_rotation: 30,
    x: 6,
    y: 5,
  }

  const pad = createNpthPadFromCircuitJson({
    pcbHole,
    componentCenter: { x: 5, y: 5 },
    componentRotation: 90,
  })

  expect(pad).not.toBeNull()
  expect(pad!.at?.x).toBeCloseTo(0, 5)
  expect(pad!.at?.y).toBeCloseTo(1)
  expect(pad!.at?.angle).toBe(30)
})
