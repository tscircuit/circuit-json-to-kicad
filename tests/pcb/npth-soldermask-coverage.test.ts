/**
 * Non-plated holes dropped authored Circuit JSON fields on export:
 * is_covered_with_solder_mask still emitted a "*.Mask" opening (the hole was
 * supposed to be tented), soldermask_margin was discarded, and rect/square
 * hole shapes collapsed to a small round pad and drill.
 *
 * To run: bun test tests/pcb/npth-soldermask-coverage.test.ts
 */
import { expect, test } from "bun:test"
import type { PcbHole } from "circuit-json"
import { createNpthPadFromCircuitJson } from "../../lib/pcb/stages/utils/CreateNpthPadFromCircuitJson"

const makeHole = (overrides: Record<string, unknown>): PcbHole =>
  ({
    type: "pcb_hole",
    pcb_hole_id: `pcb_hole_${overrides.hole_shape ?? "circle"}`,
    x: 2,
    y: -3,
    ...overrides,
  }) as PcbHole

const convert = (overrides: Record<string, unknown>) =>
  createNpthPadFromCircuitJson({
    pcbHole: makeHole(overrides),
    componentCenter: { x: 0, y: 0 },
  })

test("npth pads honor soldermask coverage, margin and rect/square shapes", () => {
  const covered = convert({
    hole_shape: "circle",
    hole_diameter: 3,
    is_covered_with_solder_mask: true,
  })
  expect(covered?.layers?.layers).toEqual(["*.Cu"])

  const exposed = convert({
    hole_shape: "circle",
    hole_diameter: 3,
    is_covered_with_solder_mask: false,
  })
  expect(exposed?.layers?.layers).toEqual(["*.Cu", "*.Mask"])

  const margin = convert({
    hole_shape: "circle",
    hole_diameter: 3,
    soldermask_margin: 0.5,
  })
  expect(margin?.solderMaskMargin).toBe(0.5)

  const rect = convert({
    hole_shape: "rect",
    hole_width: 4,
    hole_height: 2,
  })
  expect(rect?.shape).toBe("rect")
  expect(rect?.size?.width).toBe(4)
  expect(rect?.size?.height).toBe(2)
  expect(rect?.drill?.oval).toBe(true)
  expect(rect?.drill?.diameter).toBe(4)
  expect(rect?.drill?.width).toBe(2)

  const square = convert({
    hole_shape: "square",
    hole_diameter: 2.5,
  })
  expect(square?.shape).toBe("rect")
  expect(square?.size?.width).toBe(2.5)
  expect(square?.size?.height).toBe(2.5)
  expect(square?.drill?.diameter).toBe(2.5)
})
